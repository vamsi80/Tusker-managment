
import { getDb } from "@/lib/registry";

export async function getDailyReportFormData(workspaceId: string, userId: string) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const reportQuery = getDb().dailyReport.findFirst({
        where: {
            workspaceId,
            userId,
            date: startOfDay,
        },
        select: { id: true, status: true },
    });

    // Find projects managed by the user (LEAD or PROJECT_MANAGER)
    const [workspaceMember, projectMembers] = await Promise.all([
        getDb().workspaceMember.findFirst({
            where: { workspaceId, userId },
        }),
        getDb().projectMember.findMany({
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

    const tasksQuery = getDb().task.findMany({
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
