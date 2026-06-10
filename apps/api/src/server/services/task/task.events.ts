import { recordActivity } from "@/lib/audit";
import { getTaskInvolvedUserIds } from "@/lib/involved-users";
import { getDb } from "@/lib/registry";
import { broadcastTaskUpdate } from "@/lib/realtime";

async function getMemberName(memberId: string | null): Promise<string | null> {
  if (!memberId) return null;
  try {
    const member = await getDb().projectMember.findUnique({
      where: { id: memberId },
      select: {
        workspaceMember: {
          select: {
            user: {
              select: {
                name: true,
                surname: true,
              }
            }
          }
        }
      }
    });
    const user = member?.workspaceMember?.user;
    return user ? (user.surname || user.name || null) : null;
  } catch (e) {
    console.error("[TASK_EVENTS] Failed to get member name:", e);
    return null;
  }
}

/**
 * TaskEvents — side effects that happen after a task mutation.
 * Cache invalidation + activity broadcasting.
 * No DB queries beyond what is strictly necessary for broadcasting.
 */
export class TaskEvents {
  static async onTaskCreated(opts: {
    taskId: string;
    projectId: string;
    workspaceId: string;
    userId: string;
    userName: string;
    taskData: any;
    projectSlug?: string | null;
  }) {

    try {
      const targetUserIds = await getTaskInvolvedUserIds(getDb(), opts.taskId);
      await recordActivity(getDb(), {
        userId: opts.userId,
        userName: opts.userName,
        workspaceId: opts.workspaceId,
        action: "TASK_CREATED",
        entityType: "TASK",
        entityId: opts.taskId,
        newData: { ...opts.taskData, projectSlug: opts.projectSlug },
        broadcastEvent: "team_update",
        targetUserIds,
      });
      broadcastTaskUpdate({
        workspaceId: opts.workspaceId,
        type: "CREATE",
        taskId: opts.taskId,
        projectId: opts.projectId,
        payload: { id: opts.taskId, ...opts.taskData, projectId: opts.projectId },
        targetUserIds,
      }).catch((e) => console.error("[TASK_EVENTS] broadcast failed:", e));
    } catch (e) {
      console.error("[TASK_EVENTS] Task activity failed:", e);
    }
  }

  static async onSubTaskCreated(opts: {
    taskId: string;
    projectId: string;
    workspaceId: string;
    userId: string;
    userName: string;
    taskData: any;
    projectSlug?: string | null;
  }) {

    try {
      const targetUserIds = await getTaskInvolvedUserIds(getDb(), opts.taskId);
      await recordActivity(getDb(), {
        userId: opts.userId,
        userName: opts.userName,
        workspaceId: opts.workspaceId,
        action: "SUBTASK_CREATED",
        entityType: "SUBTASK",
        entityId: opts.taskId,
        newData: { ...opts.taskData, projectSlug: opts.projectSlug },
        broadcastEvent: "team_update",
        targetUserIds,
      });
      broadcastTaskUpdate({
        workspaceId: opts.workspaceId,
        type: "CREATE",
        taskId: opts.taskId,
        projectId: opts.projectId,
        payload: { id: opts.taskId, ...opts.taskData, projectId: opts.projectId },
        targetUserIds,
      }).catch((e) => console.error("[TASK_EVENTS] broadcast failed:", e));
    } catch (e) {
      console.error("[TASK_EVENTS] Subtask activity failed:", e);
    }
  }

  static async onTaskUpdated(opts: {
    taskId: string;
    isSubTask: boolean;
    projectId: string;
    workspaceId: string;
    userId: string;
    userName: string;
    oldData: any;
    newData: any;
  }) {

    try {
      const enrichedOldData = { ...opts.oldData };
      const enrichedNewData = { ...opts.newData };

      if (opts.oldData.assigneeId !== undefined || opts.newData.assigneeId !== undefined) {
        if (opts.oldData.assigneeId) {
          enrichedOldData.assigneeName = await getMemberName(opts.oldData.assigneeId);
        }
        if (opts.newData.assigneeId) {
          enrichedNewData.assigneeName = await getMemberName(opts.newData.assigneeId);
        }
      }

      if (opts.oldData.reviewerId !== undefined || opts.newData.reviewerId !== undefined) {
        if (opts.oldData.reviewerId) {
          enrichedOldData.reviewerName = await getMemberName(opts.oldData.reviewerId);
        }
        if (opts.newData.reviewerId) {
          enrichedNewData.reviewerName = await getMemberName(opts.newData.reviewerId);
        }
      }

      const targetUserIds = await getTaskInvolvedUserIds(getDb(), opts.taskId);
      await recordActivity(getDb(), {
        userId: opts.userId,
        userName: opts.userName,
        workspaceId: opts.workspaceId,
        action: opts.isSubTask ? "SUBTASK_UPDATED" : "TASK_UPDATED",
        entityType: opts.isSubTask ? "SUBTASK" : "TASK",
        entityId: opts.taskId,
        oldData: enrichedOldData,
        newData: enrichedNewData,
        broadcastEvent: "team_update",
        targetUserIds,
      });
      broadcastTaskUpdate({
        workspaceId: opts.workspaceId,
        type: "UPDATE",
        taskId: opts.taskId,
        projectId: opts.projectId,
        payload: { id: opts.taskId, projectId: opts.projectId, ...opts.newData },
        targetUserIds,
      }).catch((e) => console.error("[TASK_EVENTS] broadcast failed:", e));
    } catch (e) {
      console.error("[TASK_EVENTS] Update activity failed:", e);
    }
  }

  static async onStatusChanged(opts: {
    taskId: string;
    workspaceId: string;
    projectId: string;
    userId: string;
    userName: string;
    oldStatus: string;
    newStatus: string;
  }) {
    try {
      const targetUserIds = await getTaskInvolvedUserIds(getDb(), opts.taskId);

      await recordActivity(getDb(), {
        userId: opts.userId,
        userName: opts.userName,
        workspaceId: opts.workspaceId,
        action: "TASK_UPDATED",
        entityType: "TASK",
        entityId: opts.taskId,
        oldData: { status: opts.oldStatus },
        newData: { status: opts.newStatus },
        broadcastEvent: "team_update",
        targetUserIds,
      });
      broadcastTaskUpdate({
        workspaceId: opts.workspaceId,
        type: "UPDATE",
        taskId: opts.taskId,
        projectId: opts.projectId,
        payload: { id: opts.taskId, projectId: opts.projectId, status: opts.newStatus },
        targetUserIds,
      }).catch((e) => console.error("[TASK_EVENTS] broadcast failed:", e));
    } catch (e) {
      console.error("[TASK_EVENTS] Status broadcast failed:", e);
    }
  }

  static async onTaskDeleted(opts: {
    taskId: string;
    isSubTask: boolean;
    projectId: string;
    workspaceId: string;
    userId: string;
    userName: string;
    taskName: string;
    taskStatus: string;
    targetUserIds: string[];
    position?: number;
    parentTaskId?: string;
  }) {

    try {
      await recordActivity(getDb(), {
        userId: opts.userId,
        userName: opts.userName,
        workspaceId: opts.workspaceId,
        action: opts.isSubTask ? "SUBTASK_DELETED" : "TASK_DELETED",
        entityType: opts.isSubTask ? "SUBTASK" : "TASK",
        entityId: opts.taskId,
        oldData: {
          name: opts.taskName,
          status: opts.taskStatus,
          projectId: opts.projectId,
          position: opts.position,
          parentTaskId: opts.parentTaskId
        },
        broadcastEvent: "team_update",
        targetUserIds: opts.targetUserIds,
      });
      broadcastTaskUpdate({
        workspaceId: opts.workspaceId,
        type: "DELETE",
        taskId: opts.taskId,
        projectId: opts.projectId,
        payload: { id: opts.taskId, projectId: opts.projectId },
        targetUserIds: opts.targetUserIds,
      }).catch((e) => console.error("[TASK_EVENTS] broadcast failed:", e));
    } catch (e) {
      console.error("[TASK_EVENTS] Delete activity failed:", e);
    }
  }

  static async onAssigneeChanged(opts: {
    taskId: string;
    isSubTask: boolean;
    projectId: string;
    workspaceId: string;
    userId: string;
    userName: string;
    oldAssigneeId: string | null;
    newAssigneeId: string | null;
    commentActivity?: { id: string; createdAt: Date } | null;
    explanation?: string;
  }) {

    const targetUserIds = await getTaskInvolvedUserIds(getDb(), opts.taskId);
    const oldAssigneeName = opts.oldAssigneeId ? await getMemberName(opts.oldAssigneeId) : null;
    const newAssigneeName = opts.newAssigneeId ? await getMemberName(opts.newAssigneeId) : null;

    await Promise.all([
      recordActivity(getDb(), {
        userId: opts.userId,
        userName: opts.userName,
        workspaceId: opts.workspaceId,
        action: opts.isSubTask ? "SUBTASK_UPDATED" : "TASK_UPDATED",
        entityType: opts.isSubTask ? "SUBTASK" : "TASK",
        entityId: opts.taskId,
        oldData: { assigneeId: opts.oldAssigneeId, assigneeName: oldAssigneeName },
        newData: { assigneeId: opts.newAssigneeId, assigneeName: newAssigneeName },
        broadcastEvent: "team_update",
        targetUserIds,
      }),
      broadcastTaskUpdate({
        workspaceId: opts.workspaceId,
        type: "UPDATE",
        taskId: opts.taskId,
        projectId: opts.projectId,
        payload: { id: opts.taskId, projectId: opts.projectId, assigneeId: opts.newAssigneeId },
        targetUserIds,
      }),
      opts.commentActivity
        ? recordActivity(getDb(), {
            userId: opts.userId,
            userName: opts.userName,
            workspaceId: opts.workspaceId,
            action: "COMMENT_CREATED",
            entityType: "SUBTASK",
            entityId: opts.taskId,
            newData: {
              id: opts.commentActivity.id,
              text: opts.explanation?.trim(),
              createdAt: opts.commentActivity.createdAt.toISOString(),
            },
            broadcastEvent: "team_update",
            targetUserIds,
          })
        : Promise.resolve(),
    ]);
  }

  static async onDatesUpdated(opts: {
    taskId: string;
    isSubTask: boolean;
    projectId: string;
    workspaceId: string;
    userId: string;
    userName: string;
    startDate: Date;
    dueDate: Date;
    days: number;
    oldStartDate?: Date | null;
    oldDueDate?: Date | null;
    oldDays?: number | null;
  }) {

    try {
      const targetUserIds = await getTaskInvolvedUserIds(getDb(), opts.taskId);
      await recordActivity(getDb(), {
        userId: opts.userId,
        userName: opts.userName,
        workspaceId: opts.workspaceId,
        action: opts.isSubTask ? "SUBTASK_UPDATED" : "TASK_UPDATED",
        entityType: opts.isSubTask ? "SUBTASK" : "TASK",
        entityId: opts.taskId,
        oldData: {
          startDate: opts.oldStartDate,
          dueDate: opts.oldDueDate,
          days: opts.oldDays
        },
        newData: {
          startDate: opts.startDate,
          dueDate: opts.dueDate,
          days: opts.days
        },
        broadcastEvent: "team_update",
        targetUserIds,
      });
      broadcastTaskUpdate({
        workspaceId: opts.workspaceId,
        type: "UPDATE",
        taskId: opts.taskId,
        projectId: opts.projectId,
        payload: { id: opts.taskId, projectId: opts.projectId, startDate: opts.startDate, dueDate: opts.dueDate, days: opts.days },
        targetUserIds,
      }).catch((e) => console.error("[TASK_EVENTS] broadcast failed:", e));
    } catch (e) {
      console.error("[TASK_EVENTS] Date update activity failed:", e);
    }
  }
}
