"use server";

import { reportsClient } from "@/lib/api-client/reports";

export async function loadMoreReportsAction({
    workspaceId,
    date,
    userId,
    skip = 0,
    take = 30
}: {
    workspaceId: string;
    date?: string;
    userId?: string;
    skip?: number;
    take?: number;
}) {
    const response = await reportsClient.getReports({ workspaceId, date, userId, skip, take });
    return response.data ?? [];
}
