/**
 * Desktop stand-in for packages/core/src/server/services/report.service.ts. The
 * website's reports page calls ReportService.getReports with permissions it
 * resolved; GET /reports/:workspaceId resolves the same ones itself and runs the
 * same call.
 */
import { api } from "../../../web/lib/desktop-api";

export class ReportService {
    static getReports(params: { workspaceId: string; date?: string; userId?: string | string[]; skip?: number; take?: number }) {
        const userIds = params.userId === undefined ? undefined : Array.isArray(params.userId) ? params.userId : [params.userId];
        return api<any>(`/reports/${params.workspaceId}`, {
            query: {
                date: params.date,
                userId: userIds?.length ? JSON.stringify(userIds) : undefined,
                skip: params.skip ?? 0,
                take: params.take ?? 30,
            },
        });
    }
}
