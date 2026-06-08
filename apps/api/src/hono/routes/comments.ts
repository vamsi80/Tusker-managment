import { Hono } from "hono";
import { HonoVariables } from "../types";
import { CommentService } from "@/server/services/comment";
import { AppError } from "@tusker/shared/errors";

const comments = new Hono<{ Variables: HonoVariables }>();

/**
 * GET /api/v1/comments/task/:taskId
 * Fetch all comments for a task
 */
comments.get("/task/:taskId", async (c) => {
    const taskId = c.req.param("taskId");
    const limit = parseInt(c.req.query("limit") || "10", 10);
    const cursor = c.req.query("cursor");
    const result = await CommentService.getTaskCommentsPaginated(taskId, limit, cursor);
    return c.json({ success: true, ...result });
});

/**
 * GET /api/v1/comments/activities/:subTaskId
 * Fetch all activities for a subtask
 */
comments.get("/activities/:subTaskId", async (c) => {
    const subTaskId = c.req.param("subTaskId");
    const limit = parseInt(c.req.query("limit") || "10", 10);
    const cursor = c.req.query("cursor");
    const result = await CommentService.getActivitiesPaginated(subTaskId, limit, cursor);
    return c.json({ success: true, ...result });
});

/**
 * POST /api/v1/comments
 * Create a new comment
 */
comments.post("/", async (c) => {
    const user = c.get("user");
    const body = await c.req.json();
    const { taskId, content, workspaceId, projectId, parentCommentId } = body;

    if (!taskId || !content || !workspaceId || !projectId) {
        throw AppError.ValidationError("Missing required fields");
    }

    const comment = await CommentService.createComment({
        taskId,
        content,
        userId: user.id,
        workspaceId,
        projectId,
        parentCommentId
    });

    return c.json({ success: true, data: comment });
});

/**
 * POST /api/v1/comments/activity
 * Create a new activity
 */
comments.post("/activity", async (c) => {
    const user = c.get("user");
    const body = await c.req.json();
    const { subTaskId, text, workspaceId, projectId, attachmentData, previousStatus, targetStatus } = body;

    if (!subTaskId || !workspaceId || !projectId) {
        throw AppError.ValidationError("Missing required fields");
    }

    const activity = await CommentService.createActivity({
        subTaskId,
        text,
        userId: user.id,
        workspaceId,
        projectId,
        attachmentData,
        previousStatus,
        targetStatus
    });

    return c.json({ success: true, data: activity });
});

/**
 * PATCH /api/v1/comments/:commentId
 * Update a comment
 */
comments.patch("/:commentId", async (c) => {
    const user = c.get("user");
    const commentId = c.req.param("commentId");
    const { content } = await c.req.json();

    if (!content) {
        throw AppError.ValidationError("Content is required");
    }

    const updated = await CommentService.updateComment(commentId, content, user.id);
    return c.json({ success: true, data: updated });
});

/**
 * DELETE /api/v1/comments/:commentId
 * Delete a comment
 */
comments.delete("/:commentId", async (c) => {
    const user = c.get("user");
    const commentId = c.req.param("commentId");

    await CommentService.deleteComment(commentId, user.id);
    return c.json({ success: true, message: "Comment deleted" });
});

/**
 * GET /api/v1/comments/notifications/:workspaceId
 * Get notifications for a workspace
 */
comments.get("/notifications/:workspaceId", async (c) => {
    const user = c.get("user");
    const workspaceId = c.req.param("workspaceId");
    const limit = parseInt(c.req.query("limit") || "25", 10);
    const cursor = c.req.query("cursor") || undefined;

    const notifications = await CommentService.getNotifications({
        workspaceId,
        userId: user.id,
        limit,
        cursor
    });

    return c.json({ success: true, data: notifications });
});

/**
 * POST /api/v1/comments/notifications/:workspaceId/mark-all-read
 * Mark all notifications as read in a workspace
 */
comments.post("/notifications/:workspaceId/mark-all-read", async (c) => {
    const user = c.get("user");
    const workspaceId = c.req.param("workspaceId");

    const result = await CommentService.markAllAsRead(workspaceId, user.id);
    return c.json(result);
});

/**
 * POST /api/v1/comments/task/:taskId/read
 * Mark comments as read
 */
comments.post("/task/:taskId/read", async (c) => {
    const user = c.get("user");
    const taskId = c.req.param("taskId");

    await CommentService.markAsRead(taskId, user.id);
    return c.json({ success: true, message: "Marked as read" });
});

export default comments;
