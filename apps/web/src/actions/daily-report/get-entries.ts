"use server";

import { reportsClient } from "@/lib/api-client/reports";

export async function getReportEntries(workspaceId: string, reportId: string) {
    const response = await reportsClient.getReportEntries(workspaceId, reportId);
    if (response.status !== "success") {
        throw new Error(response.message || "Failed to fetch report entries");
    }
    return response.data;
}
