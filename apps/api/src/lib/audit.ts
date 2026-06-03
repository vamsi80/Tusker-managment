import type { DbClient } from "./db";
import type { PusherClient } from "./pusher";

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

interface RecordActivityOptions {
    userId: string;
    userName?: string;
    workspaceId?: string;
    action: AuditAction;
    entityType?: string;
    entityId?: string;
    oldData?: any;
    newData?: any;
    ipAddress?: string;
    userAgent?: string;
    broadcastEvent?: string;
    targetUserIds?: string[];
}

export async function recordActivity(db: DbClient, options: RecordActivityOptions) {
    const {
        userId,
        userName: providedName,
        workspaceId,
        action,
        entityType,
        entityId,
        oldData,
        newData,
        ipAddress,
        userAgent,
    } = options;

    try {
        let metadata: any = null;
        if (oldData && newData) {
            metadata = calculateDelta(oldData, newData);
        } else if (newData) {
            metadata = { payload: newData };
        }

        // Write audit log directly (CF Workers don't support setInterval reliably)
        db.auditLog.create({
            data: {
                userId,
                workspaceId,
                action,
                entityType,
                entityId,
                metadata,
                ipAddress,
                userAgent,
            },
        }).catch((err: any) => console.error("[AUDIT] DB write error:", err));

    } catch (error) {
        console.error("[AUDIT_LOG_ERROR]", error);
    }
}

export async function broadcastActivity(
    db: DbClient,
    pusher: PusherClient | null,
    options: RecordActivityOptions
) {
    const {
        userId,
        userName: providedName,
        workspaceId,
        action,
        entityType,
        entityId,
        oldData,
        newData,
    } = options;

    if (!workspaceId || !pusher) return;

    let metadata: any = null;
    if (oldData && newData) {
        metadata = calculateDelta(oldData, newData);
    } else if (newData) {
        metadata = { payload: newData };
    }

    try {
        const { getWorkspaceAuthorities } = await import("./involved-users");
        const finalTargetUserIds = options.targetUserIds && options.targetUserIds.length > 0
            ? options.targetUserIds
            : await getWorkspaceAuthorities(db, workspaceId);

        if (!providedName) return;
        const userName = providedName;

        let actionLabel = action.replace(/_/g, " ").toLowerCase();
        let taskName = "";
        if (entityId && (entityType === "TASK" || entityType === "SUBTASK")) {
            try {
                const task = await db.task.findUnique({
                    where: { id: entityId },
                    select: { name: true },
                });
                if (task) taskName = task.name;
            } catch {}
        }

        const formatStatus = (s: string) => s
            ? s.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
            : "unknown";

        if (action === "MEMBER_INVITED") actionLabel = "invited a new member";
        if (action === "MEMBER_REMOVED") actionLabel = "removed a member";
        if (action === "MEMBER_UPDATED") actionLabel = "updated a member's role";
        if (action === "WORKSPACE_UPDATED") actionLabel = "updated workspace info";
        if (action === "TASK_CREATED") actionLabel = `created a new task "${newData?.name || taskName || ""}"`;
        if (action === "SUBTASK_CREATED") actionLabel = `created a subtask "${newData?.name || taskName || ""}"`;
        if (action === "TASK_DELETED") actionLabel = `deleted the task "${oldData?.name || ""}"`;
        if (action === "SUBTASK_DELETED") actionLabel = `deleted the subtask "${oldData?.name || ""}"`;
        if (action === "SUBTASK_UPDATED" || action === "TASK_UPDATED") {
            const delta = oldData && newData ? calculateDelta(oldData, newData) : null;
            if (delta?.status) {
                const namePart = taskName ? `"${taskName}"` : (entityType === "SUBTASK" ? "subtask" : "task");
                actionLabel = `updated status of ${namePart} from ${formatStatus(delta.status.from)} to ${formatStatus(delta.status.to)}`;
            } else if (delta?.name) {
                actionLabel = `renamed "${oldData?.name || "task"}" to "${newData?.name || ""}"`;
            } else {
                const namePart = taskName ? `"${taskName}"` : (entityType === "SUBTASK" ? "subtask" : "task");
                actionLabel = `updated the ${entityType === "SUBTASK" ? "subtask" : "task"} ${namePart}`;
            }
        }
        if (action === "COMMENT_CREATED") actionLabel = "added a comment";

        const message = `${userName} ${actionLabel}`;
        const eventPayload = { userId, userName, action, entityType, entityId, metadata, newData, oldData, message };

        const activityChannels = finalTargetUserIds.map(tid => `user-${tid}`);
        if (activityChannels.length > 0) {
            await pusher.trigger(activityChannels, "activity_log", eventPayload)
                .catch((err: any) => console.error("[PUSHER] activity_log error:", err));
        }

        // Persist notifications
        if (finalTargetUserIds.length > 0) {
            const notifications = finalTargetUserIds.map(tid => ({
                id: crypto.randomUUID(),
                userId: tid,
                workspaceId,
                title: action.replace(/_/g, " "),
                body: message,
                type: action,
                entityId,
                entityType,
                metadata: metadata || {},
                updatedAt: new Date(),
            }));
            (db.notification as any).createMany({ data: notifications })
                .catch((err: any) => console.error("[AUDIT] Notification error:", err));
        }

        if (options.broadcastEvent) {
            let normalizedType = action.replace("MEMBER_", "").replace("TASK_", "").replace("SUBTASK_", "").replace("LEAVE_", "");
            if (normalizedType === "INVITED") normalizedType = "INVITE";
            if (normalizedType === "REMOVED") normalizedType = "DELETE";
            if (normalizedType === "CREATED" || normalizedType === "REQUESTED") normalizedType = "CREATE";
            if (["UPDATED", "APPROVED", "REJECTED", "STATUS_CHANGED"].includes(normalizedType)) normalizedType = "UPDATE";

            const payload = newData || metadata || {};
            if (entityId && !payload.id) (payload as any).id = entityId;

            const syncChannels = finalTargetUserIds.map(tid => `user-${tid}`);
            if (syncChannels.length > 0) {
                await pusher.trigger(syncChannels, options.broadcastEvent, {
                    workspaceId, userId, type: normalizedType, message, payload,
                }).catch((err: any) => console.error(`[PUSHER] ${options.broadcastEvent} error:`, err));
            }
        }
    } catch (error) {
        console.error("[BROADCAST_ACTIVITY_ERROR]", error);
    }
}

function calculateDelta(oldObj: any, newObj: any) {
    const delta: any = {};
    Object.keys(newObj).forEach(key => {
        if (JSON.stringify(oldObj[key]) !== JSON.stringify(newObj[key])) {
            delta[key] = { from: oldObj[key], to: newObj[key] };
        }
    });
    return Object.keys(delta).length > 0 ? delta : null;
}
