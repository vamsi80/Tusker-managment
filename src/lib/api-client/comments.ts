import { apiFetch } from "./fetch-wrapper";

/**
 * Comments API Client
 * Replaces legacy Server Actions in @/actions/comment
 */
export interface CommentActionResponse<T = any> {
  data?: T;
  error?: { message: string };
  success?: boolean;
}

export const commentsClient = {
  /**
   * Fetch all comments for a task
   */
  getComments: async (taskId: string, cursor?: string, limit: number = 10): Promise<CommentActionResponse<{ items: any[], nextCursor: string | null }>> => {
    try {
      const query = new URLSearchParams({ limit: limit.toString() });
      if (cursor) query.set("cursor", cursor);
      const response = await apiFetch<any>(
        `/comments/task/${taskId}?${query.toString()}`
      );
      return { data: { items: response.items || [], nextCursor: response.nextCursor || null } };
    } catch (error: any) {
      return { error: { message: error.message || "Failed to fetch comments" } };
    }
  },

  /**
   * Fetch all activities for a subtask
   */
  getActivities: async (subTaskId: string, cursor?: string, limit: number = 10): Promise<CommentActionResponse<{ items: any[], nextCursor: string | null }>> => {
    try {
      const query = new URLSearchParams({ limit: limit.toString() });
      if (cursor) query.set("cursor", cursor);
      const response = await apiFetch<any>(
        `/comments/activities/${subTaskId}?${query.toString()}`
      );
      return { data: { items: response.items || [], nextCursor: response.nextCursor || null } };
    } catch (error: any) {
      return { error: { message: error.message || "Failed to fetch activities" } };
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
      const response = await apiFetch<{ success: boolean; data: any }>(
        "/comments",
        {
          method: "POST",
          body: JSON.stringify(opts),
        }
      );
      return { data: response.data };
    } catch (error: any) {
      return { error: { message: error.message || "Failed to create comment" } };
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
    attachmentData?: any;
    previousStatus?: string;
    targetStatus?: string;
  }): Promise<CommentActionResponse> => {
    try {
      const response = await apiFetch<{ success: boolean; data: any }>(
        "/comments/activity",
        {
          method: "POST",
          body: JSON.stringify(opts),
        }
      );
      return { data: response.data };
    } catch (error: any) {
      return { error: { message: error.message || "Failed to record activity" } };
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
      const response = await apiFetch<{ success: boolean; data: any }>(
        `/comments/${commentId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ content }),
        }
      );
      return { data: response.data };
    } catch (error: any) {
      return { error: { message: error.message || "Failed to update comment" } };
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
    } catch (error: any) {
      return { success: false, error: { message: error.message || "Failed to delete comment" } };
    }
  },

  /**
   * Get notifications for a workspace
   */
  getNotifications: async (
    workspaceId: string,
    limit: number = 25,
    offset: number = 0
  ): Promise<CommentActionResponse> => {
    try {
      const data = await apiFetch<any>(
        `/comments/notifications/${workspaceId}?limit=${limit}&offset=${offset}`
      );
      return { data: data.data };
    } catch (error: any) {
      return { error: { message: error.message || "Failed to fetch notifications" } };
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
    } catch (error: any) {
      return { success: false, error: { message: error.message || "Failed to mark as read" } };
    }
  },
};
