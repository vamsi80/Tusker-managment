"use server";

import { reportsClient } from "@/lib/api-client/reports";
import { DailyReportFormType } from "@tusker/shared/schemas";

export async function getDailyReportStatus(workspaceId: string) {
    const response = await reportsClient.getStatus(workspaceId);
    return response.data;
}

export async function getDailyReportFormData(workspaceId: string) {
    const response = await reportsClient.getFormData(workspaceId);
    return response.data;
}

export async function submitDailyReport(values: DailyReportFormType) {
    const response = await reportsClient.submitReport(values);
    if (response.status !== "success") {
        throw new Error(response.message || "Failed to submit report");
    }
    return { success: true };
}
