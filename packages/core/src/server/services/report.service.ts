import prisma from "@tusker/db";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** UTC midnight for a "yyyy-MM-dd" or "d MMM yyyy" day; today (UTC) when absent or unparseable. */
function reportDay(value?: string): Date {
  const iso = value?.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
  const dmy = value?.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})$/);
  const month = dmy ? MONTHS.indexOf(dmy[2].toLowerCase()) : -1;
  if (dmy && month >= 0) return new Date(Date.UTC(+dmy[3], month, +dmy[1]));
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return today;
}

export class ReportService {
  /**
   * Load paginated daily reports with filters
   */
  static async getReports(params: {
    workspaceId: string;
    date?: string;
    userId?: string | string[];
    skip?: number;
    take?: number;
    isWorkspaceAdmin: boolean;
    currentWorkspaceMemberId: string;
  }) {
    const { workspaceId, date, userId, skip = 0, take = 30, isWorkspaceAdmin, currentWorkspaceMemberId } = params;

    // If not admin, only show own reports
    // We need to find the user ID for the current member if not admin
    let effectiveUserId: string | string[] | undefined = userId;
    
    if (!isWorkspaceAdmin) {
        const member = await prisma.workspaceMember.findUnique({
            where: { id: currentWorkspaceMemberId },
            select: { userId: true }
        });
        effectiveUserId = member?.userId;
    }

    const dateQuery = date ? new Date(date) : undefined;
    if (dateQuery) dateQuery.setHours(0, 0, 0, 0);

    const reports = await prisma.dailyReport.findMany({
      where: {
        workspaceId,
        ...(dateQuery ? { date: dateQuery } : {}),
        ...(effectiveUserId
          ? { userId: Array.isArray(effectiveUserId) ? { in: effectiveUserId } : effectiveUserId }
          : {})
      },
      include: {
        user: {
          select: {
            id: true,
            surname: true,
            email: true
          }
        },
        entries: {
          include: {
            task: {
              select: {
                id: true,
                name: true,
                taskSlug: true,
                project: {
                  select: {
                    name: true,
                    color: true
                  }
                },
                parentTask: {
                  select: {
                    name: true
                  }
                }
              }
            }
          },
          orderBy: {
            createdAt: "asc"
          }
        }
      },
      orderBy: [
        { date: "desc" },
        { submittedAt: "desc" }
      ],
      skip,
      take
    });

    const rows: any[] = [];

    for (const report of reports) {
      if (report.status === "ABSENT" || report.status === "NOT_SUBMITTED") {
        rows.push({
          id: `${report.status.toLowerCase()}-${report.id}`,
          userId: report.userId,
          user: report.user,
          status: report.status,
          submittedAt: null,
          type: "NONE",
          task: null,
          description: report.status === "ABSENT" ? "No report submitted (Absent)." : "Not yet submitted.",
          date: report.date,
        });
      } else if (report.entries.length === 0) {
        rows.push({
          id: `empty-${report.id}`,
          userId: report.userId,
          user: report.user,
          status: report.status,
          submittedAt: report.submittedAt,
          type: "NONE",
          task: null,
          description: "Submitted an empty report.",
          date: report.date,
        });
      } else {
        rows.push({
          id: report.id,
          userId: report.userId,
          user: report.user,
          status: report.status,
          submittedAt: report.submittedAt,
          date: report.date,
          entries: report.entries,
          // Easy access for the first entry's data
          task: report.entries[0]?.task,
          description: report.entries[0]?.description,
        });
      }
    }

    return rows;
  }

  /**
   * Get all entries for a specific report
   */
  static async getReportEntries(reportId: string) {
    const entries = await prisma.dailyReportEntry.findMany({
      where: { reportId },
      include: {
        task: {
          select: {
            id: true,
            name: true,
            status: true,
            taskSlug: true,
          }
        }
      },
      orderBy: {
        type: "asc" // TASK first
      }
    });

    return entries;
  }

  /**
   * Get report status for a user today
   */
  static async getReportStatus(workspaceId: string, userId: string) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const report = await prisma.dailyReport.findUnique({
      where: {
        workspaceId_userId_date: {
          workspaceId,
          userId,
          date: startOfDay,
        },
      },
      select: { status: true },
    });

    return { status: report?.status || "NOT_SUBMITTED" };
  }

  /**
   * Get data needed for the report submission form
   */
  static async getReportFormData(workspaceId: string, userId: string) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const reportQuery = prisma.dailyReport.findFirst({
      where: {
        workspaceId,
        userId,
        date: startOfDay,
      },
      select: { id: true, status: true },
    });

    // Find projects managed by the user (LEAD or PROJECT_MANAGER)
    const [workspaceMember, projectMembers] = await Promise.all([
      prisma.workspaceMember.findFirst({
        where: { workspaceId, userId },
      }),
      prisma.projectMember.findMany({
        where: {
          workspaceMember: {
            userId,
            workspaceId,
          },
          projectRole: { in: ["LEAD", "PROJECT_MANAGER"] }
        },
        select: { projectId: true }
      })
    ]);

    const managedProjectIds = projectMembers.map(pm => pm.projectId);
    const isWorkspaceAdmin = workspaceMember?.workspaceRole === "OWNER" || workspaceMember?.workspaceRole === "ADMIN";

    const tasksQuery = prisma.task.findMany({
      where: {
        workspaceId,
        status: { notIn: ["COMPLETED", "CANCELLED"] },
        OR: isWorkspaceAdmin ? undefined : [
          { assigneeId: userId },
          { projectId: { in: managedProjectIds } }
        ]
      },
      select: {
        id: true,
        name: true,
        status: true,
        dueDate: true,
        updatedAt: true,
        parentTask: {
          select: {
            name: true,
          }
        },
        project: {
          select: {
            name: true,
            color: true,
          }
        }
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });

    const [report, suggestedTasks] = await Promise.all([reportQuery, tasksQuery]);
    return { report, suggestedTasks };
  }

  /**
   * Submit a daily report
   */
  static async submitReport(userId: string, data: {
    workspaceId: string;
    entries: { taskId?: string | null; description: string }[];
    date?: string;
  }) {
    const { workspaceId, entries, date: clientDate } = data;

    // UTC midnight of the client's calendar day. Accepts "yyyy-MM-dd" and the web
    // form's "d MMM yyyy" — the latter used to become `21 Oct 2026T00:00:00Z`,
    // an Invalid Date that failed every submission.
    const startOfDay = reportDay(clientDate);

    const result = await prisma.$transaction(async (tx: any) => {
      let report = await tx.dailyReport.findUnique({
        where: {
          workspaceId_userId_date: {
            workspaceId,
            userId,
            date: startOfDay,
          },
        },
      });

      if (!report) {
        report = await tx.dailyReport.create({
          data: {
            workspaceId,
            userId,
            date: startOfDay,
            status: "SUBMITTED",
            submittedAt: new Date(),
          },
        });
      } else {
        if (report.status === "ABSENT") {
          report = await tx.dailyReport.update({
            where: { id: report.id },
            data: { status: "SUBMITTED", submittedAt: new Date(), isAutoGenerated: false },
          });
        } else {
          report = await tx.dailyReport.update({
            where: { id: report.id },
            data: { submittedAt: new Date() },
          });
        }
      }

      // Map safely
      const finalEntries = entries.map((e) => ({
        reportId: report.id,
        taskId: (e.taskId === "other" || !e.taskId) ? null : e.taskId,
        type: (e.taskId === null || e.taskId === "other" || !e.taskId) ? "OTHER" : "TASK" as "OTHER" | "TASK",
        description: e.description,
      }));

      await tx.dailyReportEntry.createMany({
        data: finalEntries,
      });

      return report;
    });

    return result;
  }
}
