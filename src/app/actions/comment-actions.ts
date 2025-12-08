"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
    createComment,
    getTaskComments,
    editComment,
    deleteComment,
} from "@/lib/comment-helpers";
import { revalidatePath } from "next/cache";

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

        // Revalidate the task page to show the new comment
        revalidatePath(`/w/[workspaceId]/p/[slug]/task`, 'page');

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

        // Revalidate the task page to show the new reply
        revalidatePath(`/w/[workspaceId]/p/[slug]/task`, 'page');

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

        // Revalidate the task page to show the updated comment
        revalidatePath(`/w/[workspaceId]/p/[slug]/task`, 'page');

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

        await deleteComment(commentId, session.user.id);

        // Revalidate the task page to reflect the deletion
        revalidatePath(`/w/[workspaceId]/p/[slug]/task`, 'page');

        return { success: true };
    } catch (error) {
        console.error("Error deleting comment:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to delete comment",
        };
    }
}
