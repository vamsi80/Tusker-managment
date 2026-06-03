import { getDb } from "@/lib/registry";

export async function getDailyReportStatus(workspaceId: string, userId: string) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const report = await getDb().dailyReport.findUnique({
        where: { workspaceId_userId_date: { workspaceId, userId, date: startOfDay } },
        select: { status: true },
    });

    return { status: report?.status || "NOT_SUBMITTED" };
}

export const getDailyReportStatusForUser = getDailyReportStatus;
