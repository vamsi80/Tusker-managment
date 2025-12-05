"use server";

import { cache } from "react";
import { unstable_cache } from "next/cache";
import prisma from "@/lib/db";
import { requireUser } from "@/app/data/user/require-user";

// ============================================
// INTERNAL FUNCTIONS (Actual DB queries)
// ============================================

/**
 * Internal function to fetch project tasks with pagination
 * Uses $transaction to combine count + data queries into a single DB round-trip
 */
async function _getProjectTasksInternal(projectId: string, page: number, pageSize: number) {
    const skip = (page - 1) * pageSize;

    // Use $transaction to combine count and data queries (reduces DB round trips by 50%)
    const [totalCount, tasks] = await prisma.$transaction([
        prisma.task.count({
            where: {
                projectId: projectId,
                parentTaskId: null,
            },
        }),
        prisma.task.findMany({
            where: {
                projectId: projectId,
                parentTaskId: null, // Only get parent tasks
            },
            include: {
                createdBy: {
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
                assignee: {
                    include: {
                        workspaceMember: {
                            include: {
                                user: {
                                    select: {
                                        id: true,
                                        name: true,
                                        surname: true,
                                        image: true,
                                    },
                                },
                            },
                        },
                    },
                },
                _count: {
                    select: {
                        subTasks: true,
                    },
                },
            },
            orderBy: {
                position: 'asc',
            },
            skip,
            take: pageSize,
        }),
    ]);

    return {
        tasks,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
        currentPage: page,
        hasMore: skip + tasks.length < totalCount,
    };
}

/**
 * Internal function to fetch subtasks with pagination
 * Uses $transaction to combine count + data queries
 */
async function _getTaskSubTasksInternal(parentTaskId: string, page: number, pageSize: number) {
    const skip = (page - 1) * pageSize;

    // Use $transaction to combine count and data queries
    const [totalCount, subTasks] = await prisma.$transaction([
        prisma.task.count({
            where: {
                parentTaskId: parentTaskId,
            },
        }),
        prisma.task.findMany({
            where: {
                parentTaskId: parentTaskId,
            },
            include: {
                assignee: {
                    include: {
                        workspaceMember: {
                            include: {
                                user: {
                                    select: {
                                        id: true,
                                        name: true,
                                        surname: true,
                                        image: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
            orderBy: {
                position: 'asc',
            },
            skip,
            take: pageSize,
        }),
    ]);

    return {
        subTasks,
        totalCount,
        hasMore: skip + subTasks.length < totalCount,
        currentPage: page,
    };
}

// ============================================
// CACHED VERSIONS (Next.js unstable_cache)
// ============================================

/**
 * Cached version of getProjectTasks using Next.js unstable_cache
 * - Persists across requests for 60 seconds
 * - Tagged for targeted invalidation
 */
const getCachedProjectTasks = (projectId: string, page: number, pageSize: number) =>
    unstable_cache(
        async () => _getProjectTasksInternal(projectId, page, pageSize),
        [`project-tasks-${projectId}-page-${page}-size-${pageSize}`],
        {
            tags: [`project-tasks-${projectId}`, `project-tasks-all`],
            revalidate: 60, // Cache for 60 seconds
        }
    )();

/**
 * Cached version of getTaskSubTasks using Next.js unstable_cache
 * - Persists across requests for 60 seconds
 * - Tagged for targeted invalidation
 */
const getCachedTaskSubTasks = (parentTaskId: string, page: number, pageSize: number) =>
    unstable_cache(
        async () => _getTaskSubTasksInternal(parentTaskId, page, pageSize),
        [`task-subtasks-${parentTaskId}-page-${page}-size-${pageSize}`],
        {
            tags: [`task-subtasks-${parentTaskId}`, `task-subtasks-all`],
            revalidate: 60, // Cache for 60 seconds
        }
    )();

// ============================================
// PUBLIC API (React cache for request deduplication)
// ============================================

/**
 * Get parent tasks with pagination
 * 
 * Caching Strategy:
 * 1. React cache() - Deduplicates identical requests within the same render
 * 2. unstable_cache() - Persists data across requests for 60 seconds
 * 3. $transaction - Combines count + data queries into single DB call
 * 
 * Cache Invalidation:
 * - Use revalidateTag(`project-tasks-${projectId}`) to invalidate specific project
 * - Use revalidateTag(`project-tasks-all`) to invalidate all projects
 */
export const getProjectTasks = cache(async (projectId: string, page: number = 1, pageSize: number = 10) => {
    await requireUser(); // Auth check (cached via React cache)

    try {
        return await getCachedProjectTasks(projectId, page, pageSize);
    } catch (error) {
        console.error("Error fetching project tasks:", error);
        return {
            tasks: [],
            totalCount: 0,
            totalPages: 0,
            currentPage: 1,
            hasMore: false,
        };
    }
});

/**
 * Get subtasks for a specific parent task with pagination
 * 
 * Caching Strategy:
 * 1. React cache() - Deduplicates identical requests within the same render
 * 2. unstable_cache() - Persists data across requests for 60 seconds
 * 3. $transaction - Combines count + data queries into single DB call
 * 
 * Cache Invalidation:
 * - Use revalidateTag(`task-subtasks-${parentTaskId}`) to invalidate specific task's subtasks
 * - Use revalidateTag(`task-subtasks-all`) to invalidate all subtasks
 */
export const getTaskSubTasks = cache(async (parentTaskId: string, page: number = 1, pageSize: number = 10) => {
    await requireUser(); // Auth check (cached via React cache)

    try {
        return await getCachedTaskSubTasks(parentTaskId, page, pageSize);
    } catch (error) {
        console.error("Error fetching subtasks:", error);
        return {
            subTasks: [],
            totalCount: 0,
            hasMore: false,
            currentPage: 1,
        };
    }
});

// ============================================
// TYPE EXPORTS
// ============================================

export type ProjectTasksResponse = Awaited<ReturnType<typeof getProjectTasks>>;
export type ProjectTaskType = ProjectTasksResponse['tasks'];
export type SubTasksResponse = Awaited<ReturnType<typeof getTaskSubTasks>>;
export type SubTaskType = SubTasksResponse['subTasks'];
