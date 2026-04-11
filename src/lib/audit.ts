import prisma from "./db";
import { pusherServer } from "./pusher";

export type AuditAction = 
  | "USER_LOGIN"
  | "MEMBER_INVITED"
  | "MEMBER_REMOVED"
  | "TASK_CREATED"
  | "TASK_UPDATED"
  | "TASK_DELETED"
  | "SUBTASK_CREATED"
  | "SUBTASK_UPDATED"
  | "SUBTASK_DELETED"
  | "COMMENT_CREATED";

interface RecordActivityOptions {
  userId: string;
  workspaceId?: string;
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  oldData?: any;
  newData?: any;
  ipAddress?: string;
  userAgent?: string;
  broadcastEvent?: string;
}

/**
 * Utility to record an audit log and broadcast the activity in real-time.
 */
export async function recordActivity(options: RecordActivityOptions) {
  const { 
    userId, 
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
    // 1. Calculate the delta/metadata if both old and new data are provided
    let metadata: any = null;
    if (oldData && newData) {
      metadata = calculateDelta(oldData, newData);
      // If no changes detected on a micro-update, we might skip logging, 
      // but usually we log the attempt or just the specific fields.
    } else if (newData) {
      metadata = { payload: newData };
    }

    // 2. Save to Database
    const log = await prisma.auditLog.create({
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
      include: {
        user: {
          select: {
            name: true,
            email: true,
            image: true,
          }
        }
      }
    });

    // 3. Broadcast in Real-time via Pusher
    if (workspaceId) {
      const userName = log.user?.name || "Someone";
      let actionLabel = action.replace(/_/g, " ").toLowerCase();
      // Refine label
      if (action === "MEMBER_INVITED") actionLabel = "invited a new member";
      if (action === "MEMBER_REMOVED") actionLabel = "removed a member";
      if (action === "TASK_CREATED") actionLabel = "created a new task";
      if (action === "TASK_UPDATED") actionLabel = "updated a task";
      if (action === "TASK_DELETED") actionLabel = "deleted a task";
      if (action === "SUBTASK_UPDATED") {
        if (oldData?.status !== newData?.status && newData?.status) {
          actionLabel = `updated status to ${newData.status.replace(/_/g, " ")}`;
        } else {
          actionLabel = "updated a task";
        }
      }
      if (action === "COMMENT_CREATED") actionLabel = "added a comment";
      
      const message = `${userName} ${actionLabel}`;

      console.log(`[AUDIT_LOG] Triggering activity_log for workspace ${workspaceId}: ${message}`);
      
      // General activity log for admins and global toasts
      await pusherServer.trigger(`team-${workspaceId}`, "activity_log", {
        ...log,
        userName,
        message,
      }).catch((err: any) => console.error("[PUSHER_TRIGGER_ERROR] activity_log:", err));

      // Targeted UI update events (e.g., "team_update")
      if (options.broadcastEvent) {
        // Normalize action strings to match INVITE/DELETE/UPDATE patterns used in TeamEventData
        let normalizedType = action.replace("MEMBER_", "").replace("TASK_", "").replace("SUBTASK_", "");
        if (normalizedType === "INVITED") normalizedType = "INVITE";
        if (normalizedType === "REMOVED") normalizedType = "DELETE";
        if (normalizedType === "CREATED" || normalizedType === "UPDATED") normalizedType = "UPDATE";

        console.log(`[AUDIT_LOG] Triggering targeted event ${options.broadcastEvent} with type ${normalizedType}`);
        await pusherServer.trigger(`team-${workspaceId}`, options.broadcastEvent, {
          workspaceId,
          type: normalizedType,
          message,
          payload: newData || metadata || {},
        }).catch((err: any) => console.error(`[PUSHER_TRIGGER_ERROR] ${options.broadcastEvent}:`, err));
      }
    }

    return log;
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
