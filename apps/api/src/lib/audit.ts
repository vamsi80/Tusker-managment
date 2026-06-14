import type { DbClient } from "./db";
import { broadcast, broadcastActivityLog, ACTIVITY_LOG } from "./realtime";
import { Prisma } from "@/generated/prisma";

export type AuditAction =
    | "USER_LOGIN"
    | "MEMBER_INVITED"
    | "MEMBER_REMOVED"
    | "MEMBER_UPDATED"
    | "WORKSPACE_UPDATED"
    | "TASK_CREATED"
    | "TASK_UPDATED"
    | "TASK_DELETED"
    | "SUBTASK_CREATED"
    | "SUBTASK_UPDATED"
    | "SUBTASK_DELETED"
    | "COMMENT_CREATED"
    | "CHECKED_IN"
    | "CHECKED_OUT"
    | "RESENT_INVITATION"
    | "ATTENDANCE_SETTINGS_UPDATED"
    | "LEAVE_REQUESTED"
    | "LEAVE_APPROVED"
    | "LEAVE_REJECTED"
    | "DM_MESSAGE"
    | "REQUESTED_PASSWORD_RESET";

// Actions that are audit-only — recorded for compliance but never turned into a
// user-facing notification (matches the exclusions in the notifications read path).
const AUDIT_ONLY_ACTIONS = new Set<AuditAction>(["USER_LOGIN", "REQUESTED_PASSWORD_RESET"]);

interface RecordActivityOptions {
    /** The actor who performed the action. */
    userId: string;
    userName?: string;
    workspaceId?: string;
    action: AuditAction;
    entityType?: string;
    entityId?: string;
    oldData?: Record<string, unknown> | null;
    newData?: Record<string, unknown> | null;
    ipAddress?: string;
    userAgent?: string;
    /** Typed realtime event to also emit for live list-sync (e.g. "team_update"). */
    broadcastEvent?: string;
    /** Recipients of the notification + realtime nudge (involved users, excluding the actor). */
    targetUserIds?: string[];
}

/**
 * THE single chokepoint for domain side effects. For every audit-worthy action it
 * ATOMICALLY (one DB transaction) writes:
 *   1. the immutable AuditLog record (always),
 *   2. one notification row per recipient (idempotent on (userId, eventId)),
 *   3. one Outbox row carrying the realtime "activity_log" event.
 * After commit it publishes the Outbox event to the WS service and marks it published;
 * if that fails, the row stays unpublished and the cron sweeper re-publishes it
 * (at-least-once delivery). The DB is the source of truth; the WebSocket is a live nudge.
 */
export async function recordActivity(db: DbClient, options: RecordActivityOptions) {
    const {
        userId,
        userName,
        workspaceId,
        action,
        entityType,
        entityId,
        oldData,
        newData,
        ipAddress,
        userAgent,
        broadcastEvent,
    } = options;

    try {
        let metadata: Prisma.InputJsonValue | null = null;
        if (oldData && newData) {
            metadata = calculateDelta(oldData, newData) as Prisma.InputJsonValue;
        } else if (newData) {
            metadata = { payload: newData } as Prisma.InputJsonValue;
        }

        const shouldNotify =
            !!workspaceId &&
            !AUDIT_ONLY_ACTIONS.has(action) &&
            (options.targetUserIds?.length ?? 0) > 0;

        // Recipients never include the actor.
        const targetUserIds = (options.targetUserIds ?? []).filter((id) => id !== userId);

        const message = userName ? `${userName} ${describeAction(action, oldData, newData)}` : action.replace(/_/g, " ");
        const eventId = crypto.randomUUID();
        const eventPayload = {
            userId, userName, action, entityType, entityId, metadata, newData, oldData, message,
            pusherEventId: eventId,
        };

        let outboxId: string | null = null;

        // ── Atomic write: audit + notifications + outbox in one transaction ──
        await db.$transaction(async (tx) => {
            await tx.auditLog.create({
                data: {
                    userId,
                    workspaceId,
                    action,
                    entityType,
                    entityId,
                    metadata: metadata as Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue,
                    ipAddress,
                    userAgent,
                },
            });

            if (shouldNotify && targetUserIds.length > 0) {
                await tx.notification.createMany({
                    data: targetUserIds.map((tid) => ({
                        id: crypto.randomUUID(),
                        userId: tid,
                        workspaceId: workspaceId!,
                        title: action.replace(/_/g, " "),
                        body: message,
                        type: action,
                        entityId,
                        entityType,
                        eventId,
                        metadata: (metadata || {}) as Prisma.InputJsonValue,
                        updatedAt: new Date(),
                    })),
                    skipDuplicates: true,
                });

                const outbox = await tx.outbox.create({
                    data: {
                        workspaceId: workspaceId!,
                        event: ACTIVITY_LOG,
                        payload: eventPayload as Prisma.InputJsonValue,
                        targetUserIds,
                    },
                    select: { id: true },
                });
                outboxId = outbox.id;
            }
        });

        // ── Publish (best-effort; sweeper is the safety net) ──
        if (shouldNotify && outboxId) {
            try {
                await broadcastActivityLog({ workspaceId: workspaceId!, targetUserIds, payload: eventPayload });
                await db.outbox.update({ where: { id: outboxId }, data: { publishedAt: new Date() } });
            } catch (err) {
                console.error("[AUDIT] activity_log publish failed (sweeper will retry):", err);
                await db.outbox.update({ where: { id: outboxId }, data: { attempts: { increment: 1 } } }).catch(() => {});
            }
        }

        // Typed live-sync event (best-effort; clients reconcile on reconnect).
        if (broadcastEvent && workspaceId) {
            const payload = (newData || metadata || {}) as Record<string, unknown>;
            if (entityId && !payload.id) payload.id = entityId;
            await broadcast(workspaceId, broadcastEvent, { workspaceId, userId, message, payload }, targetUserIds)
                .catch((err: unknown) => console.error(`[REALTIME] ${broadcastEvent} error:`, err));
        }
    } catch (error) {
        console.error("[AUDIT_LOG_ERROR]", error);
    }
}

/** Alias — `recordActivity` is the canonical domain-event chokepoint. */
export const emitDomainEvent = recordActivity;

function describeAction(
    action: AuditAction,
    oldData?: Record<string, unknown> | null,
    newData?: Record<string, unknown> | null,
): string {
    const formatStatus = (s: string) => s
        ? s.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
        : "unknown";
    switch (action) {
        case "MEMBER_INVITED": return "invited a new member";
        case "MEMBER_REMOVED": return "removed a member";
        case "MEMBER_UPDATED": return "updated a member's role";
        case "WORKSPACE_UPDATED": return "updated workspace info";
        case "TASK_CREATED": return `created a new task "${newData?.name || ""}"`;
        case "SUBTASK_CREATED": return `created a subtask "${newData?.name || ""}"`;
        case "TASK_DELETED": return `deleted the task "${oldData?.name || ""}"`;
        case "SUBTASK_DELETED": return `deleted the subtask "${oldData?.name || ""}"`;
        case "COMMENT_CREATED": return "added a comment";
        case "CHECKED_IN": return "checked in";
        case "CHECKED_OUT": return "checked out";
        case "LEAVE_REQUESTED": return "requested leave";
        case "LEAVE_APPROVED": return "approved a leave request";
        case "LEAVE_REJECTED": return "rejected a leave request";
        case "TASK_UPDATED":
        case "SUBTASK_UPDATED": {
            const delta = oldData && newData ? calculateDelta(oldData, newData) : null;
            if (delta?.status) {
                return `updated status from ${formatStatus(String(delta.status.from))} to ${formatStatus(String(delta.status.to))}`;
            }
            if (delta?.name) return `renamed "${oldData?.name || "task"}" to "${newData?.name || ""}"`;
            return `updated the ${action === "SUBTASK_UPDATED" ? "subtask" : "task"}`;
        }
        default: return action.replace(/_/g, " ").toLowerCase();
    }
}

function calculateDelta(oldObj: Record<string, unknown>, newObj: Record<string, unknown>): Record<string, { from: unknown; to: unknown }> | null {
    const delta: Record<string, { from: unknown; to: unknown }> = {};
    Object.keys(newObj).forEach(key => {
        if (JSON.stringify(oldObj[key]) !== JSON.stringify(newObj[key])) {
            delta[key] = { from: oldObj[key], to: newObj[key] };
        }
    });
    return Object.keys(delta).length > 0 ? delta : null;
}
