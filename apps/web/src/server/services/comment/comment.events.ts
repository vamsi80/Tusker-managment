import { invalidateTaskComments } from "@/lib/cache/invalidation";
import { getTaskInvolvedUserIds } from "@/lib/involved-users";

export class CommentEvents {
  /**
   * Record comment creation activity
   */
  static async onCommentCreated(params: {
    userId: string;
    userName: string;
    workspaceId: string;
    taskId: string;
    content: string;
    comment: any;
  }) {
    const { recordActivity } = await import("@/lib/audit");
    const targetUserIds = await getTaskInvolvedUserIds(params.taskId);

    await recordActivity({
      userId: params.userId,
      userName: params.userName,
      workspaceId: params.workspaceId,
      action: "COMMENT_CREATED",
      entityType: "TASK",
      entityId: params.taskId,
      newData: {
        text: params.content,
        comment: {
          ...params.comment,
          user: {
            id: params.comment.user.id,
            surname: params.comment.user.surname
          }
        }
      },
      targetUserIds,
    });

    await invalidateTaskComments(params.taskId);
  }

  /**
   * Record subtask activity creation
   */
  static async onActivityCreated(params: {
    userId: string;
    userName: string;
    workspaceId: string;
    subTaskId: string;
    text: string;
    activityId: string;
  }) {
    const { recordActivity } = await import("@/lib/audit");
    const targetUserIds = await getTaskInvolvedUserIds(params.subTaskId);

    await recordActivity({
      userId: params.userId,
      userName: params.userName,
      workspaceId: params.workspaceId,
      action: "COMMENT_CREATED",
      entityType: "SUBTASK",
      entityId: params.subTaskId,
      newData: {
        id: params.activityId,
        text: params.text,
        createdAt: new Date().toISOString()
      },
      broadcastEvent: "team_update",
      targetUserIds,
    });

    const { updateTag } = await import("next/cache");
    updateTag(`activities-${params.subTaskId}`);
  }

  /**
   * On comment updated
   */
  static async onCommentUpdated(taskId: string) {
    await invalidateTaskComments(taskId);
  }

  /**
   * On comment deleted
   */
  static async onCommentDeleted(taskId: string) {
    await invalidateTaskComments(taskId);
  }
}
