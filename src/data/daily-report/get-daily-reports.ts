import prisma from "@/lib/db";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";

/**
 * Gets daily reports for the admin view
 */
export async function getAdminDailyReports(workspaceId: string, date?: Date, userId?: string, skip = 0, take = 50) {
    const { isWorkspaceAdmin } = await getWorkspacePermissions(workspaceId);

    if (!isWorkspaceAdmin) {
        throw new Error("Unauthorized");
    }

    const reports = await prisma.dailyReport.findMany({
        where: {
            workspaceId,
            ...(date ? { date } : {}),
            ...(userId ? { userId } : {})
        },
        select: {
            id: true,
            userId: true,
            status: true,
            submittedAt: true,
            date: true,
            user: {
                select: {
                    name: true,
                    surname: true,
                    image: true,
                    email: true
                }
            }
        },
        orderBy: {
            date: "desc"
        },
        skip,
        take
    });

    return reports;
}

export async function getAdminAllReportEntries(workspaceId: string, date?: Date, userId?: string, skip = 0, take = 100) {
    const { isWorkspaceAdmin } = await getWorkspacePermissions(workspaceId);

    if (!isWorkspaceAdmin) {
        throw new Error("Unauthorized");
    }

    // Fetches all entries flatly
    const entries = await prisma.dailyReportEntry.findMany({
        where: {
            report: {
                workspaceId,
                ...(date ? { date } : {}),
                ...(userId ? { userId } : {})
            }
        },
        include: {
            report: {
                include: {
                    user: {
                        select: {
                            name: true,
                            surname: true,
                            email: true,
                            image: true
                        }
                    }
                }
            },
            task: {
                select: {
                    id: true,
                    name: true,
                    status: true,
                    taskSlug: true,
                    project: {
                        select: {
                            name: true,
                            color: true
                        }
                    }
                }
            }
        },
        orderBy: [
            { report: { date: 'desc' } },
            { type: "asc" }
        ],
        skip,
        take
    });

    return entries;
}
