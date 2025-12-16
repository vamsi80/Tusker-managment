"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
    createComment,
    editComment,
    deleteComment,
} from "@/lib/comment-helpers";
import prisma from "@/lib/db";
import { getTaskComments } from "@/app/data/comment/get-comments";
import { getTaskPageData } from "@/app/data/task/get-task-page-data";

/**
 * Server action to create a new comment on a task
 */
export async function createTaskComment(taskId: string, content: string) {
    try {
        const session = await auth.api.getSession({
            headers: await headers(),
        });

        if (!session?.user) {
            return { success: false, error: "Unauthorized" };
        }

        const comment = await createComment({
            content,
            userId: session.user.id,
            taskId,
        });

        // Invalidate comment cache using cache tags (faster than revalidatePath)
        await invalidateTaskComments(taskId);

        return { success: true, comment };
    } catch (error) {
        console.error("Error creating comment:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to create comment",
        };
    }
}

/**
 * Server action to create a reply to a comment
 */
export async function createCommentReply(
    taskId: string,
    parentCommentId: string,
    content: string
) {
    try {
        const session = await auth.api.getSession({
            headers: await headers(),
        });

        if (!session?.user) {
            return { success: false, error: "Unauthorized" };
        }

        const comment = await createComment({
            content,
            userId: session.user.id,
            taskId,
            parentCommentId,
        });

        // Invalidate comment cache using cache tags
        await invalidateTaskComments(taskId);

        return { success: true, comment };
    } catch (error) {
        console.error("Error creating reply:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to create reply",
        };
    }
}

/**
 * Server action to get all comments for a task
 */
export async function fetchTaskComments(taskId: string) {
    try {
        const session = await auth.api.getSession({
            headers: await headers(),
        });

        if (!session?.user) {
            return { success: false, error: "Unauthorized" };
        }

        // Use centralized data fetching with caching
        const comments = await getTaskComments(taskId);

        return {
            success: true,
            comments,
            currentUserId: session.user.id
        };
    } catch (error) {
        console.error("Error fetching comments:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to fetch comments",
        };
    }
}

/**
 * Server action to edit a comment
 */
export async function updateComment(commentId: string, newContent: string) {
    try {
        const session = await auth.api.getSession({
            headers: await headers(),
        });

        if (!session?.user) {
            return { success: false, error: "Unauthorized" };
        }

        const comment = await editComment(commentId, session.user.id, newContent);

        // Get comment's taskId for cache invalidation
        const commentData = await prisma.comment.findUnique({
            where: { id: commentId },
            select: {
                taskId: true,
            }
        });

        if (commentData) {
            // Invalidate comment cache using cache tags
            await invalidateTaskComments(commentData.taskId);
        }

        return { success: true, comment };
    } catch (error) {
        console.error("Error updating comment:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to update comment",
        };
    }
}

/**
 * Server action to delete a comment
 */
export async function removeComment(commentId: string) {
    try {
        const session = await auth.api.getSession({
            headers: await headers(),
        });

        if (!session?.user) {
            return { success: false, error: "Unauthorized" };
        }

        // Get comment's taskId before deletion
        const commentData = await prisma.comment.findUnique({
            where: { id: commentId },
            select: {
                taskId: true,
            }
        });

        await deleteComment(commentId, session.user.id);

        // Invalidate comment cache using cache tags
        if (commentData) {
            await invalidateTaskComments(commentData.taskId);
        }

        return { success: true };
    } catch (error) {
        console.error("Error deleting comment:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to delete comment",
        };
    }
}

import { getReviewComments } from "@/app/data/comment/get-comments";
import { invalidateTaskComments } from "@/lib/cache/invalidation";

/**
 * Server action to fetch review comments for a subtask
 */
export async function fetchReviewComments(subTaskId: string) {
    try {
        const session = await auth.api.getSession({
            headers: await headers(),
        });

        if (!session?.user) {
            return { success: false, error: "Unauthorized" };
        }

        // Use centralized data fetching with caching
        const reviewComments = await getReviewComments(subTaskId);

        return {
            success: true,
            reviewComments,
        };
    } catch (error) {
        console.error("Error fetching review comments:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to fetch review comments",
        };
    }
}

