"use server";

import { cache } from "react";
import { unstable_cache } from "next/cache";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/auth/require-user";

/**
 * Internal function to fetch task comments
 */
async function _getTaskCommentsInternal(taskId: string) {
    return prisma.comment.findMany({
        where: {
            taskId,
            isDeleted: false,
        },
        include: {
            user: {
                select: {
                    id: true,
                    name: true,
                    surname: true,
                    email: true,
                    image: true,
                },
            },
            replies: {
                where: {
                    isDeleted: false,
                },
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            surname: true,
                            email: true,
                            image: true,
                        },
                    },
                },
                orderBy: {
                    createdAt: 'asc',
                },
            },
        },
        orderBy: {
            createdAt: 'asc',
        },
    });
}

/**
 * Cached version of task comments
 */
const getCachedTaskComments = (taskId: string) =>
    unstable_cache(
        async () => _getTaskCommentsInternal(taskId),
        [`task-comments-${taskId}`],
        {
            tags: [`task-comments-${taskId}`, `task-${taskId}`, `comments-all`],
            revalidate: 30, // 30 seconds - comments change frequently
        }
    )();

/**
 * Get all comments for a task with caching
 * Uses dual cache layer (React cache + Next.js unstable_cache)
 * 
 * @param taskId - ID of the task to fetch comments for
 * @returns Array of comments with user information and replies
 */
export const getTaskComments = cache(async (taskId: string) => {
    const user = await requireUser();

    try {
        return await getCachedTaskComments(taskId);
    } catch (error) {
        console.error("Error fetching task comments:", error);
        return [];
    }
});

/**
 * Internal function to fetch review comments for a subtask
 */
async function _getReviewCommentsInternal(subTaskId: string) {
    return prisma.reviewComment.findMany({
        where: {
            subTaskId,
        },
        include: {
            author: {
                include: {
                    user: {
                        select: {
                            name: true,
                            surname: true,
                            image: true,
                        },
                    },
                },
            },
        },
        orderBy: {
            createdAt: 'asc',
        },
    });
}

/**
 * Cached version of review comments
 */
const getCachedReviewComments = (subTaskId: string) =>
    unstable_cache(
        async () => _getReviewCommentsInternal(subTaskId),
        [`review-comments-${subTaskId}`],
        {
            tags: [
                `review-comments-${subTaskId}`,
                `subtask-${subTaskId}`,
                `review-comments-all`
            ],
            revalidate: 30, // 30 seconds - review comments change frequently
        }
    )();

/**
 * Get all review comments for a subtask with caching
 * Uses dual cache layer (React cache + Next.js unstable_cache)
 * 
 * @param subTaskId - ID of the subtask to fetch review comments for
 * @returns Array of review comments with author information
 */
export const getReviewComments = cache(async (subTaskId: string) => {
    const user = await requireUser();

    try {
        return await getCachedReviewComments(subTaskId);
    } catch (error) {
        console.error("Error fetching review comments:", error);
        return [];
    }
});

// Type exports
export type TaskCommentsType = Awaited<ReturnType<typeof getTaskComments>>;
export type ReviewCommentsType = Awaited<ReturnType<typeof getReviewComments>>;
