import prisma from "./db";
import { pusherServer } from "./pusher";
import { randomUUID } from "crypto";

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
  | "REQUESTED_PASSWORD_RESET";

interface RecordActivityOptions {
  userId: string;
  userName?: string; // Pass from caller to avoid DB join
  workspaceId?: string;
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  oldData?: any;
  newData?: any;
  ipAddress?: string;
  userAgent?: string;
  broadcastEvent?: string;
  targetUserIds?: string[]; // New: list of specific users to notify
}

// ─── In-Memory Audit Buffer ───────────────────────────────
// Accumulates audit log entries and flushes them to the DB in batches,
// reducing per-event DB round-trips from 1-2 down to 0.

interface BufferedLog {
  userId: string;
  workspaceId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: any;
  ipAddress?: string;
  userAgent?: string;
}

const auditBuffer: BufferedLog[] = [];
const FLUSH_INTERVAL_MS = 5_000; // Flush logs every 5 seconds
const MAX_BUFFER_SIZE = 25; // Or flush when buffer reaches this size
let flushTimer: ReturnType<typeof setInterval> | null = null;

/** Start the background flush timer (idempotent) */
function ensureFlushTimer() {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    flushBuffer().catch(() => {});
  }, FLUSH_INTERVAL_MS);

  // Don't block Node.js shutdown
  if (flushTimer && typeof flushTimer === "object" && "unref" in flushTimer) {
    flushTimer.unref();
  }
}

/** Flush all buffered logs to the database in a single batch insert */
async function flushBuffer() {
  if (auditBuffer.length === 0) return;

  const count = auditBuffer.length;
  // Drain the buffer atomically
  const batch = auditBuffer.splice(0, auditBuffer.length);

  try {
    if (process.env.NODE_ENV === "development") {
      console.log(`[AUDIT] Flushing ${count} logs...`);
    }
    await prisma.auditLog.createMany({ data: batch });
  } catch (error) {
    console.error("[AUDIT_FLUSH_ERROR] Failed to flush audit buffer:", error);
    // Re-queue failed items (at the front so order is preserved)
    auditBuffer.unshift(...batch);
  }
}

/** Force-flush (useful for graceful shutdown or testing) */
export async function flushAuditBuffer() {
  console.log("[AUDIT] Force-flushing buffer...");
  return flushBuffer();
}

// ─── Main Entry Point ─────────────────────────────────────

/**
 * Record an audit log and broadcast in real-time.
 *
 * Optimized for performance:
 * 1. Pusher broadcast happens IMMEDIATELY (no DB dependency)
 * 2. DB write is BUFFERED and flushed in batches
 * 3. No `include` join — userName is passed by the caller
 */
export async function recordActivity(options: RecordActivityOptions) {
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
    userAgent
  } = options;

  try {
    // 1. Calculate delta/metadata
    let metadata: any = null;
    if (oldData && newData) {
      metadata = calculateDelta(oldData, newData);
    } else if (newData) {
      metadata = { payload: newData };
    }

    // 2. BUFFER the DB write (non-blocking)
    auditBuffer.push({
      userId,
      workspaceId,
      action,
      entityType,
      entityId,
      metadata,
      ipAddress,
      userAgent,
    });

    // Start the flush timer if not already running
    ensureFlushTimer();

    // Flush immediately if buffer is full
    if (auditBuffer.length >= MAX_BUFFER_SIZE) {
      flushBuffer().catch(() => {});
    }

    // 3. BROADCAST via Pusher IMMEDIATELY (no DB round-trip needed)
    if (workspaceId) {
      if (!providedName) {
        throw new Error("Audit Log Error: User name/surname is missing for this activity.");
      }
      const userName = providedName;
      let actionLabel = action.replace(/_/g, " ").toLowerCase();

      // Refine label... (omitted for brevity in replace call, but keeping all existing refinement logic)
      if (action === "MEMBER_INVITED") actionLabel = "invited a new member";
      if (action === "MEMBER_REMOVED") actionLabel = "removed a member";
      if (action === "MEMBER_UPDATED") actionLabel = "updated a member's role";
      if (action === "WORKSPACE_UPDATED") actionLabel = "updated workspace info";
      if (action === "TASK_CREATED") actionLabel = "created a new task";
      if (action === "TASK_UPDATED") actionLabel = "updated a task";
      if (action === "TASK_DELETED") actionLabel = "deleted a task";
      if (action === "SUBTASK_CREATED") actionLabel = "created a subtask";
      if (action === "SUBTASK_DELETED") actionLabel = "deleted a subtask";
      if (action === "SUBTASK_UPDATED") {
        const delta = oldData && newData ? calculateDelta(oldData, newData) : null;
        if (delta?.status) {
          const statusLabel = delta.status.to.replace(/_/g, " ");
          actionLabel = `updated status to ${statusLabel}`;
        } else if (delta?.startDate || delta?.dueDate) {
          actionLabel = "updated task dates";
        } else if (delta?.assigneeId) {
          actionLabel = "reassigned the task";
        } else if (delta?.name) {
          actionLabel = "renamed the task";
        } else if (delta?.reviewerId) {
          actionLabel = "updated the reviewer";
        } else {
          actionLabel = "updated the task";
        }
      }
      if (action === "COMMENT_CREATED") actionLabel = "added a comment";
      if (action === "REQUESTED_PASSWORD_RESET") {
        const targetName = newData?.payload?.memberName || metadata?.payload?.memberName || "a member";
        actionLabel = `requested a password reset for ${targetName}`;
      }

      const message = `${userName} ${actionLabel}`;
      const eventPayload = {
        userId,
        userName,
        action,
        entityType,
        entityId,
        metadata,
        newData,
        oldData,
        message,
      };

      // 🚀 TARGETING LOGIC: Fallback to Workspace Authorities if targetUserIds is missing
      const { getWorkspaceAuthorities } = await import("./involved-users");
      const finalTargetUserIds = options.targetUserIds && options.targetUserIds.length > 0
        ? options.targetUserIds
        : await getWorkspaceAuthorities(workspaceId);

      // 3a. Targeted Activity Log (Individual Channels)
      if (pusherServer) {
        // Broadcast to all involved users (including sender so they can see activity in Notification Center/History)
        const activityChannels = finalTargetUserIds.map(tid => `user-${tid}`);

        if (activityChannels.length > 0) {
          await pusherServer.trigger(activityChannels, "activity_log", eventPayload)
            .catch((err: any) => console.error("[PUSHER_TRIGGER_ERROR] targeted activity_log:", err));
        }

        // 3c. Persistent Notifications (DB storage for later retrieval)
        if (finalTargetUserIds.length > 0) {
          const notifications = finalTargetUserIds.map(tid => ({
            id: randomUUID(),
            userId: tid,
            workspaceId,
            title: action.replace(/_/g, " "),
            body: message,
            type: action,
            entityId,
            entityType,
            metadata: metadata || {},
            updatedAt: new Date()
          }));

          // Non-blocking background save
          (prisma.notification as any).createMany({ data: notifications })
            .catch((err: any) => console.error("[AUDIT] Notification storage error:", err));
        }

        // 3d. Targeted UI update events (e.g., "team_update")
        if (options.broadcastEvent) {
          let normalizedType = action.replace("MEMBER_", "").replace("TASK_", "").replace("SUBTASK_", "").replace("LEAVE_", "");
          if (normalizedType === "INVITED") normalizedType = "INVITE";
          if (normalizedType === "REMOVED") normalizedType = "DELETE";
          if (normalizedType === "CREATED" || normalizedType === "REQUESTED") normalizedType = "CREATE";
          if (normalizedType === "UPDATED" || normalizedType === "APPROVED" || normalizedType === "REJECTED" || normalizedType === "STATUS_CHANGED") normalizedType = "UPDATE";

          const payload = newData || metadata || {};
          if (entityId && !payload.id) {
            (payload as any).id = entityId;
          }

          // Always target individual users for surgical sync
          const syncChannels = finalTargetUserIds.map(tid => `user-${tid}`);

          if (syncChannels.length > 0) {
            await pusherServer.trigger(syncChannels, options.broadcastEvent, {
              workspaceId,
              userId,
              type: normalizedType,
              message,
              payload,
            }).catch((err: any) => console.error(`[PUSHER_TRIGGER_ERROR] ${options.broadcastEvent}:`, err));
          }
        }
      } else {
        console.warn("[AUDIT] Pusher not configured, skipping real-time broadcast.");
      }
    }
  } catch (error) {
    console.error("[AUDIT_LOG_ERROR]", error);
  }
}

/**
 * Simple diffing algorithm to find changed fields.
 */
function calculateDelta(oldObj: any, newObj: any) {
  const delta: any = {};

  // We only care about keys present in the new set (the update payload)
  Object.keys(newObj).forEach(key => {
    if (JSON.stringify(oldObj[key]) !== JSON.stringify(newObj[key])) {
      delta[key] = {
        from: oldObj[key],
        to: newObj[key]
      };
    }
  });

  return Object.keys(delta).length > 0 ? delta : null;
}
