import { apiFetch } from "./fetch-wrapper";

/**
 * Comments API Client
 * Replaces legacy Server Actions in @/actions/comment
 */
export interface CommentActionResponse<T = unknown> {
  data?: T;
  error?: { message: string };
  success?: boolean;
}

export const commentsClient = {
  /**
   * Fetch all comments for a task
   */
  getComments: async (taskId: string, cursor?: string, limit: number = 10): Promise<CommentActionResponse<{ items: unknown[], nextCursor: string | null }>> => {
    try {
      const query = new URLSearchParams({ limit: limit.toString() });
      if (cursor) query.set("cursor", cursor);
      const response = await apiFetch<{ items: unknown[]; nextCursor?: string | null }>(
        `/comments/task/${taskId}?${query.toString()}`
      );
      return { data: { items: response.items || [], nextCursor: response.nextCursor || null } };
    } catch (error: unknown) {
      return { error: { message: error instanceof Error ? error.message : "Failed to fetch comments" } };
    }
  },

  /**
   * Fetch all activities for a subtask
   */
  getActivities: async (subTaskId: string, cursor?: string, limit: number = 10): Promise<CommentActionResponse<{ items: unknown[], nextCursor: string | null }>> => {
    try {
      const query = new URLSearchParams({ limit: limit.toString() });
      if (cursor) query.set("cursor", cursor);
      const response = await apiFetch<{ items: unknown[]; nextCursor?: string | null }>(
        `/comments/activities/${subTaskId}?${query.toString()}`
      );
      return { data: { items: response.items || [], nextCursor: response.nextCursor || null } };
    } catch (error: unknown) {
      return { error: { message: error instanceof Error ? error.message : "Failed to fetch activities" } };
    }
  },

  /**
   * Create a new comment
   */
  createComment: async (opts: {
    taskId: string;
    content: string;
    workspaceId: string;
    projectId: string;
    parentCommentId?: string;
  }): Promise<CommentActionResponse> => {
    try {
      const response = await apiFetch<{ success: boolean; data: unknown }>(
        "/comments",
        {
          method: "POST",
          body: JSON.stringify(opts),
        }
      );
      return { data: response.data };
    } catch (error: unknown) {
      return { error: { message: error instanceof Error ? error.message : "Failed to create comment" } };
    }
  },

  /**
   * Create a new activity
   */
  createActivity: async (opts: {
    subTaskId: string;
    text: string;
    workspaceId: string;
    projectId: string;
    attachmentData?: { url: string; name?: string; type?: string } | null;
    previousStatus?: string;
    targetStatus?: string;
  }): Promise<CommentActionResponse> => {
    try {
      const response = await apiFetch<{ success: boolean; data: unknown }>(
        "/comments/activity",
        {
          method: "POST",
          body: JSON.stringify(opts),
        }
      );
      return { data: response.data };
    } catch (error: unknown) {
      return { error: { message: error instanceof Error ? error.message : "Failed to record activity" } };
    }
  },

  /**
   * Update a comment
   */
  updateComment: async (
    commentId: string,
    content: string
  ): Promise<CommentActionResponse> => {
    try {
      const response = await apiFetch<{ success: boolean; data: unknown }>(
        `/comments/${commentId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ content }),
        }
      );
      return { data: response.data };
    } catch (error: unknown) {
      return { error: { message: error instanceof Error ? error.message : "Failed to update comment" } };
    }
  },

  /**
   * Delete a comment
   */
  deleteComment: async (commentId: string): Promise<CommentActionResponse> => {
    try {
      await apiFetch<{ success: boolean; message: string }>(
        `/comments/${commentId}`,
        {
          method: "DELETE",
        }
      );
      return { success: true };
    } catch (error: unknown) {
      return { success: false, error: { message: error instanceof Error ? error.message : "Failed to delete comment" } };
    }
  },

  /**
   * Get notifications for a workspace
   */
  getNotifications: async (
    workspaceId: string,
    limit: number = 25,
    cursor?: string
  ): Promise<CommentActionResponse> => {
    try {
      const url = `/comments/notifications/${workspaceId}?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const data = await apiFetch<{ data: unknown }>(url);
      return { data: data.data };
    } catch (error: unknown) {
      return { error: { message: error instanceof Error ? error.message : "Failed to fetch notifications" } };
    }
  },

  /**
   * Mark comments as read
   */
  markAsRead: async (taskId: string): Promise<CommentActionResponse> => {
    try {
      await apiFetch<{ success: boolean; message: string }>(
        `/comments/task/${taskId}/read`,
        {
          method: "POST",
        }
      );
      return { success: true };
    } catch (error: unknown) {
      return { success: false, error: { message: error instanceof Error ? error.message : "Failed to mark as read" } };
    }
  },

  /**
   * Mark all notifications in workspace as read
   */
  markAllAsRead: async (workspaceId: string): Promise<CommentActionResponse> => {
    try {
      await apiFetch<{ success: boolean; message: string }>(
        `/comments/notifications/${workspaceId}/mark-all-read`,
        {
          method: "POST",
        }
      );
      return { success: true };
    } catch (error: unknown) {
      return { success: false, error: { message: error instanceof Error ? error.message : "Failed to mark all as read" } };
    }
  },
};
