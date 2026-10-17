import prisma from "@tusker/db";
import { AttendanceService } from "../services/attendance/attendance.service";
import { PointsService } from "../services/points/points.service";

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
     * Reward points: −1 per open overdue task per working day (not while in
     * REVIEW). Schedule daily just after midnight IST; same-day re-runs are no-ops.
     */
    accrueOverduePoints: async () => {
        const count = await PointsService.accrueOverdue();
        return { success: true, message: `Overdue charges written: ${count}`, data: { count } };
    },

    /**
     * Example: Future Job
     */
    // cleanupOldLogs: async () => { ... }
};
