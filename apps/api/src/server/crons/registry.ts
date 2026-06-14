import { getDb } from "@/lib/registry";
import { broadcast } from "@/lib/realtime";
import { AttendanceService } from "../services/attendance/attendance.service";

export type CronJobHandler = () => Promise<{ success: boolean; message: string; data?: Record<string, unknown> }>;

const OUTBOX_MAX_ATTEMPTS = 10;
const OUTBOX_PRUNE_AFTER_MS = 7 * 24 * 60 * 60 * 1000; // keep published rows 7 days

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

    /**
     * Outbox sweeper — re-publishes realtime events whose inline publish failed
     * (WS downtime, worker cancellation, etc.). Guarantees at-least-once delivery.
     * The happy path publishes inline in recordActivity, so this usually finds nothing.
     */
    publishPendingOutbox: async () => {
        const db = getDb();
        const pending = await db.outbox.findMany({
            where: { publishedAt: null, attempts: { lt: OUTBOX_MAX_ATTEMPTS } },
            orderBy: { createdAt: "asc" },
            take: 200,
        });

        let published = 0;
        for (const row of pending) {
            try {
                await broadcast(row.workspaceId, row.event, row.payload, row.targetUserIds);
                await db.outbox.update({ where: { id: row.id }, data: { publishedAt: new Date() } });
                published++;
            } catch (error: unknown) {
                console.error(`[CRON_JOB] Outbox publish failed for ${row.id}:`, (error as { message?: string })?.message);
                await db.outbox.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } }).catch(() => {});
            }
        }

        // Prune old, already-published rows to keep the table small.
        await db.outbox.deleteMany({
            where: { publishedAt: { not: null, lt: new Date(Date.now() - OUTBOX_PRUNE_AFTER_MS) } },
        }).catch(() => {});

        return {
            success: true,
            message: `Outbox sweep: published ${published}/${pending.length} pending events`,
            data: { pending: pending.length, published },
        };
    },
};
