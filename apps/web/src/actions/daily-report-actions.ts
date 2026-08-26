"use server";

import { getSession } from "@/lib/auth/require-user";
import { DailyReportFormType } from "@tusker/core/lib/zodSchemas";
import { DailyReportService } from "@tusker/core/server/services/daily-report/daily-report.service";
import { getDailyReportFormData as getFormData } from "@/data/daily-report/get-daily-report-form-data";
import { getDailyReportStatus as getStatus } from "@/data/daily-report/get-daily-report-status";

export async function getDailyReportStatus(workspaceId: string) {
    const session = await getSession();
    if (!session) throw new Error("Unauthorized");
    return getStatus(workspaceId);
}

export async function getDailyReportFormData(workspaceId: string) {
    const session = await getSession();
    if (!session) throw new Error("Unauthorized");
    return getFormData(workspaceId);
}

export async function submitDailyReport(values: DailyReportFormType) {
    const session = await getSession();
    if (!session) throw new Error("Unauthorized");
    return DailyReportService.submit(session.user.id, values);
}
