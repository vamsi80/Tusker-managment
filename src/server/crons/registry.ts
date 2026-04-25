import prisma from "@/lib/db";
import { AttendanceService } from "../services/attendance.service";

export type CronJobHandler = () => Promise<{ success: boolean; message: string; data?: any }>;

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
        const workspaces = await prisma.workspace.findMany({
            select: { id: true, name: true }
        });

        const today = new Date();
        let totalMarked = 0;
        const results: any[] = [];

        for (const ws of workspaces) {
            try {
                const result = await AttendanceService.reconcileAttendance(ws.id, today);
                totalMarked += result.count;
                results.push({ workspace: ws.name, marked: result.count });
            } catch (error: any) {
                console.error(`[CRON_JOB] Failed for ${ws.name}:`, error.message);
                results.push({ workspace: ws.name, error: error.message });
            }
        }

        return {
            success: true,
            message: `Reconciliation completed. Total marked: ${totalMarked}`,
            data: { totalMarked, results }
        };
    },

    /**
     * Example: Future Job
     */
    // cleanupOldLogs: async () => { ... }
};
