import { invalidateTaskMutation } from "@/lib/cache/invalidation";
import { recordActivity } from "@/lib/audit";
import { getTaskInvolvedUserIds } from "@/lib/involved-users";

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
    await invalidateTaskMutation({
      projectId: opts.projectId,
      workspaceId: opts.workspaceId,
      userId: opts.userId,
      taskId: opts.taskId,
    });

    try {
      await recordActivity({
        userId: opts.userId,
        userName: opts.userName,
        workspaceId: opts.workspaceId,
        action: "TASK_CREATED",
        entityType: "TASK",
        entityId: opts.taskId,
        newData: { ...opts.taskData, projectSlug: opts.projectSlug },
        broadcastEvent: "team_update",
        targetUserIds: await getTaskInvolvedUserIds(opts.taskId),
      });
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
    await invalidateTaskMutation({
      projectId: opts.projectId,
      workspaceId: opts.workspaceId,
      userId: opts.userId,
      taskId: opts.taskId,
    });

    try {
      await recordActivity({
        userId: opts.userId,
        userName: opts.userName,
        workspaceId: opts.workspaceId,
        action: "SUBTASK_CREATED",
        entityType: "SUBTASK",
        entityId: opts.taskId,
        newData: { ...opts.taskData, projectSlug: opts.projectSlug },
        broadcastEvent: "team_update",
        targetUserIds: await getTaskInvolvedUserIds(opts.taskId),
      });
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
    await invalidateTaskMutation({
      projectId: opts.projectId,
      workspaceId: opts.workspaceId,
      userId: opts.userId,
      taskId: opts.taskId,
    });

    try {
      await recordActivity({
        userId: opts.userId,
        userName: opts.userName,
        workspaceId: opts.workspaceId,
        action: opts.isSubTask ? "SUBTASK_UPDATED" : "TASK_UPDATED",
        entityType: opts.isSubTask ? "SUBTASK" : "TASK",
        entityId: opts.taskId,
        oldData: opts.oldData,
        newData: opts.newData,
        broadcastEvent: "team_update",
        targetUserIds: await getTaskInvolvedUserIds(opts.taskId),
      });
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
    // Fire background — status change broadcasts are non-critical latency
    invalidateTaskMutation({
      projectId: opts.projectId,
      workspaceId: opts.workspaceId,
      userId: opts.userId,
      taskId: opts.taskId,
    }).catch((e) => console.error("[TASK_EVENTS] Invalidation failed:", e));

    // Background broadcast — don't block the HTTP response
    (async () => {
      try {
        const targetUserIds = await getTaskInvolvedUserIds(opts.taskId);

        await recordActivity({
          userId: opts.userId,
          userName: opts.userName,
          workspaceId: opts.workspaceId,
          action: "SUBTASK_UPDATED",
          entityType: "SUBTASK",
          entityId: opts.taskId,
          oldData: { status: opts.oldStatus },
          newData: { status: opts.newStatus },
          broadcastEvent: "team_update",
          targetUserIds,
        });
      } catch (e) {
        console.error("[TASK_EVENTS] Status broadcast failed:", e);
      }
    })();
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
    await invalidateTaskMutation({
      projectId: opts.projectId,
      workspaceId: opts.workspaceId,
      userId: opts.userId,
      taskId: opts.taskId,
    });

    try {
      await recordActivity({
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
    await invalidateTaskMutation({
      projectId: opts.projectId,
      workspaceId: opts.workspaceId,
      userId: opts.userId,
      taskId: opts.taskId,
    });

    const targetUserIds = await getTaskInvolvedUserIds(opts.taskId);

    await Promise.all([
      recordActivity({
        userId: opts.userId,
        userName: opts.userName,
        workspaceId: opts.workspaceId,
        action: opts.isSubTask ? "SUBTASK_UPDATED" : "TASK_UPDATED",
        entityType: opts.isSubTask ? "SUBTASK" : "TASK",
        entityId: opts.taskId,
        oldData: { assigneeId: opts.oldAssigneeId },
        newData: { assigneeId: opts.newAssigneeId },
        broadcastEvent: "team_update",
        targetUserIds,
      }),
      opts.commentActivity
        ? recordActivity({
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
    projectId: string;
    workspaceId: string;
    userId: string;
    userName: string;
    startDate: Date;
    dueDate: Date;
    days: number;
  }) {
    await invalidateTaskMutation({
      projectId: opts.projectId,
      workspaceId: opts.workspaceId,
      userId: opts.userId,
      taskId: opts.taskId,
    });

    try {
      await recordActivity({
        userId: opts.userId,
        userName: opts.userName,
        workspaceId: opts.workspaceId,
        action: "TASK_UPDATED",
        entityType: "TASK",
        entityId: opts.taskId,
        newData: { startDate: opts.startDate, dueDate: opts.dueDate, days: opts.days },
        broadcastEvent: "team_update",
        targetUserIds: await getTaskInvolvedUserIds(opts.taskId),
      });
    } catch (e) {
      console.error("[TASK_EVENTS] Date update activity failed:", e);
    }
  }

  static async onOrderUpdated(projectId: string) {
    const { invalidateProjectSubTasks } = await import("@/lib/cache/invalidation");
    await invalidateProjectSubTasks(projectId);
  }
}
