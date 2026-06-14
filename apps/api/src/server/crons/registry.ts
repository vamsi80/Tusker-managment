import { getDb } from "@/lib/registry";
import { AttendanceService } from "../services/attendance/attendance.service";

export type CronJobHandler = () => Promise<{ success: boolean; message: string; data?: Record<string, unknown> }>;

/**
 * Registry of all background/scheduled jobs
 */
export const CRON_JOBS: Record<string, CronJobHandler> = {
    /**
     * Reconcile attendance for all workspaces
     * Marks missing members as ABSENT
     */
    reconcileAttendance: async () => {
        console.log("[CRON_JOB] Running reconcileAttendance...");
        const workspaces = await getDb().workspace.findMany({
            select: { id: true, name: true }
        });

        const today = new Date();
        let totalMarked = 0;
        const results: Array<{ workspace: string; marked?: number; error?: string }> = [];

        for (const ws of workspaces) {
            try {
                const result = await AttendanceService.reconcileAttendance(ws.id, today);
                totalMarked += result.count;
                results.push({ workspace: ws.name, marked: result.count });
            } catch (error: unknown) {
                const msg = (error as { message?: string }).message ?? "Unknown error";
                console.error(`[CRON_JOB] Failed for ${ws.name}:`, msg);
                results.push({ workspace: ws.name, error: msg });
            }
        }

        return {
            success: true,
            message: `Reconciliation completed. Total marked: ${totalMarked}`,
            data: { totalMarked, results }
        };
    },

};
