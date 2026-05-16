import { AppError } from "@/lib/errors/app-error";
import { getUserPermissions, getWorkspacePermissions } from "@/data/user/get-user-permissions";
import { CommentRepository } from "./comment.repository";
import { CommentEvents } from "./comment.events";
import { CommentMapper } from "./comment.mapper";

export class CommentService {
  /**
   * Create a comment on a task
   */
  static async createComment(opts: {
    taskId: string;
    content: string;
    userId: string;
    workspaceId: string;
    projectId: string;
    parentCommentId?: string;
  }) {
    const { taskId, content, userId, workspaceId, projectId, parentCommentId } = opts;

    // 1. Permissions check
    const permissions = await getUserPermissions(workspaceId, projectId, userId);
    if (!permissions.workspaceMemberId) {
      throw AppError.Forbidden("You do not have access to this project");
    }

    // 2. Validate input
    if (!content.trim()) {
      throw AppError.ValidationError("Comment content is required");
    }

    // 3. Verify task
    const task = await CommentRepository.findTaskById(taskId);
    if (!task) throw AppError.NotFound("Task not found");
    if (task.projectId !== projectId) {
      throw AppError.ValidationError("Task does not belong to this project");
    }

    // 4. Handle replies
    if (parentCommentId) {
      const parentComment = await CommentRepository.findCommentById(parentCommentId);
      if (!parentComment) throw AppError.NotFound("Parent comment not found");
      if (parentComment.isDeleted) throw AppError.ValidationError("Cannot reply to a deleted comment");
      if (parentComment.taskId !== taskId) throw AppError.ValidationError("Parent comment does not belong to this task");

      const depth = await CommentRepository.getCommentDepth(parentCommentId);
      if (depth >= 5) throw AppError.ValidationError("Maximum reply depth reached (5 levels)");
    }

    // 5. Create
    const comment = await CommentRepository.createComment({
      content: content.trim(),
      userId,
      taskId,
      parentCommentId
    });

    // 6. Record Activity & Invalidate
    const user = await CommentRepository.findUserById(userId);
    await CommentEvents.onCommentCreated({
      userId,
      userName: user?.surname || user?.name || "Unknown",
      workspaceId,
      taskId,
      content,
      comment
    });

    return comment;
  }

  /**
   * Create an activity for a subtask
   */
  static async createActivity(opts: {
    subTaskId: string;
    text: string;
    userId: string;
    workspaceId: string;
    projectId: string;
    attachmentData?: {
      fileName: string;
      fileType: string;
      fileSize: number;
      base64Data: string;
    };
    previousStatus?: string;
    targetStatus?: string;
  }) {
    const { subTaskId, text, userId, workspaceId, projectId, attachmentData, previousStatus, targetStatus } = opts;

    // 1. Permissions check
    const permissions = await getUserPermissions(workspaceId, projectId, userId);
    if (!permissions.workspaceMemberId) {
      throw AppError.Forbidden("You do not have access to this project");
    }

    // 2. Verify subtask
    const subTask = await CommentRepository.findTaskById(subTaskId);
    if (!subTask) throw AppError.NotFound("Subtask not found");
    if (subTask.projectId !== projectId) {
      throw AppError.ValidationError("Subtask does not belong to this project");
    }

    // 3. Validate input
    if (!text.trim() && !attachmentData) {
      throw AppError.ValidationError("Comment text or attachment is required");
    }

    let attachmentJson: any = null;
    if (attachmentData || previousStatus || targetStatus) {
      attachmentJson = {
        ...(attachmentData ? {
          fileName: attachmentData.fileName,
          fileType: attachmentData.fileType,
          fileSize: attachmentData.fileSize,
          data: attachmentData.base64Data,
          uploadedAt: new Date().toISOString(),
        } : {}),
        ...(previousStatus ? { previousStatus } : {}),
        ...(targetStatus ? { targetStatus } : {}),
      };
    }

    // 4. Create
    const activity = await CommentRepository.createActivity({
      subTaskId,
      authorId: userId,
      workspaceId,
      text: text.trim() || "(No comment - attachment only)",
      attachment: attachmentJson,
    });

    // 5. Record Activity & Invalidate
    const user = await CommentRepository.findUserById(userId);
    await CommentEvents.onActivityCreated({
      userId,
      userName: user?.surname || user?.name || "Unknown",
      workspaceId,
      subTaskId,
      text: text.trim(),
      activityId: activity.id
    });

    return activity;
  }

  /**
   * Update a comment
   */
  static async updateComment(commentId: string, newContent: string, userId: string) {
    if (!newContent.trim()) throw AppError.ValidationError("Comment content is required");

    const comment = await CommentRepository.findCommentById(commentId);
    if (!comment) throw AppError.NotFound("Comment not found");
    if (comment.isDeleted) throw AppError.ValidationError("Cannot edit deleted comment");
    if (comment.userId !== userId) throw AppError.Forbidden("You can only edit your own comments");

    const updatedComment = await CommentRepository.updateComment(commentId, {
      content: newContent.trim(),
      isEdited: true,
      editedAt: new Date(),
    });

    await CommentEvents.onCommentUpdated(comment.taskId);
    return updatedComment;
  }

  /**
   * Delete a comment (soft delete)
   */
  static async deleteComment(commentId: string, userId: string) {
    const comment = await CommentRepository.findCommentById(commentId);
    if (!comment) throw AppError.NotFound("Comment not found");
    if (comment.isDeleted) throw AppError.ValidationError("Comment already deleted");
    if (comment.userId !== userId) throw AppError.Forbidden("You can only delete your own comments");

    await CommentRepository.softDeleteComment(commentId);
    await CommentEvents.onCommentDeleted(comment.taskId);
    return { success: true };
  }

  /**
   * Get task notifications
   */
  static async getNotifications(opts: {
    workspaceId: string;
    userId: string;
    limit?: number;
    offset?: number;
  }) {
    const { workspaceId, userId, limit = 25, offset = 0 } = opts;
    const perms = await getWorkspacePermissions(workspaceId, userId);

    if (!perms.workspaceMemberId) {
      throw AppError.Forbidden("Access denied");
    }

    const where: any = {
      task: { workspaceId: workspaceId },
      userId: { not: userId },
      isDeleted: false
    };

    if (!perms.isWorkspaceAdmin) {
      const privilegedProjectIds = [
        ...(perms.leadProjectIds || []),
        ...(perms.managedProjectIds || [])
      ];

      where.task = {
        ...where.task,
        OR: [
          { assignee: { workspaceMember: { userId: userId } } },
          { createdBy: { workspaceMember: { userId: userId } } },
          { reviewer: { workspaceMember: { userId: userId } } },
          ...(privilegedProjectIds.length > 0
            ? [{ projectId: { in: privilegedProjectIds } }]
            : [])
        ]
      };
    }

    const commentInclude = {
      user: { select: { name: true, surname: true, image: true } },
      readBy: { where: { userId: userId } },
      task: {
        select: {
          id: true,
          name: true,
          taskSlug: true,
          project: { select: { name: true, color: true } },
          parentTask: { select: { name: true } }
        }
      }
    };

    // Concurrently fetch comments, activities, and direct notifications
    const [
      { unreadComments, recentComments },
      activities,
      directNotifications
    ] = await Promise.all([
      CommentRepository.findNotifications(where, commentInclude, limit, offset),
      CommentRepository.findRecentActivities({
        workspaceId,
        authorId: { not: userId },
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, // Last 30 days
        subTask: perms.isWorkspaceAdmin ? {} : where.task
      }),
      import("@/lib/db").then(m => m.default.notification.findMany({
        where: {
          userId,
          workspaceId,
          type: "DM_MESSAGE"
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        include: { user: { select: { name: true, surname: true, image: true } } }
      }))
    ]);

    const commentMap = new Map();
    [...unreadComments, ...recentComments].forEach(c => commentMap.set(c.id, c));
    const comments = Array.from(commentMap.values())
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return CommentMapper.toNotifications(comments, activities, limit, directNotifications);
  }

  /**
   * Mark task comments as read
   */
  static async markAsRead(taskId: string, userId: string) {
    return CommentRepository.markCommentsAsRead(taskId, userId);
  }

  /**
   * Get task comments with cursor-based pagination
   */
  static async getTaskCommentsPaginated(taskId: string, limit: number = 10, cursor?: string) {
    const comments = await CommentRepository.findTaskCommentsPaginated(taskId, limit, cursor);
    return {
      items: comments,
      nextCursor: comments.length === limit ? comments[comments.length - 1].id : null,
    };
  }

  /**
   * Get subtask activities with cursor-based pagination
   */
  static async getActivitiesPaginated(subTaskId: string, limit: number = 10, cursor?: string) {
    const activities = await CommentRepository.findActivitiesPaginated(subTaskId, limit, cursor);
    return {
      items: activities,
      nextCursor: activities.length === limit ? activities[activities.length - 1].id : null,
    };
  }

  /**
   * Get task comments with caching
   */
  static async getTaskComments(taskId: string) {
    const { unstable_cache } = await import("next/cache");
    const { CacheTags } = await import("@/data/cache-tags");

    return unstable_cache(
      async () => CommentRepository.findTaskComments(taskId),
      [`task-comments-${taskId}`],
      {
        tags: CacheTags.taskComments(taskId),
        revalidate: 30,
      }
    )();
  }

  /**
   * Get subtask activities with caching
   */
  static async getActivities(subTaskId: string) {
    const { unstable_cache } = await import("next/cache");
    const { CacheTags } = await import("@/data/cache-tags");

    return unstable_cache(
      async () => CommentRepository.findActivities(subTaskId),
      [`activities-${subTaskId}`],
      {
        tags: (CacheTags as any).activities ? (CacheTags as any).activities(subTaskId) : [`activities-${subTaskId}`],
        revalidate: 30,
      }
    )();
  }
}

export type TaskCommentsType = Awaited<ReturnType<typeof CommentService.getTaskComments>>;
export type ActivitiesType = Awaited<ReturnType<typeof CommentService.getActivities>>;
