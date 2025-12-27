"use server";

import { cache } from "react";
import { unstable_cache } from "next/cache";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/auth/require-user";
import { getUserPermissions } from "@/data/user/get-user-permissions";
import { CacheTags } from "@/data/cache-tags";

// ============================================
// INTERNAL FUNCTIONS (Actual DB queries)
// ============================================

/**
 * Internal function to fetch ONLY parent tasks (no subtasks) with pagination
 * This is much faster for initial page load
 */
async function _getParentTasksOnlyInternal(
    projectId: string,
    workspaceId: string,
    userId: string,
    workspaceMemberId: string,
    isMember: boolean,
    page: number = 1,
    pageSize: number = 10
) {
    const skip = (page - 1) * pageSize;

    // Build the where clause based on user role
    const whereClause = isMember
        ? {
            projectId: projectId,
            parentTaskId: null, // Only parent tasks
            OR: [
                // Parent tasks where user has assigned subtasks
                {
                    subTasks: {
                        some: {
                            assignee: {
                                workspaceMemberId: workspaceMemberId,
                            },
                        },
                    },
                },
                // Parent tasks where user is directly assigned
                {
                    assignee: {
                        workspaceMemberId: workspaceMemberId,
                    },
                },
            ],
        }
        : {
            projectId: projectId,
            parentTaskId: null, // Only parent tasks
        };

    // Use $transaction to get both count and data
    const [totalCount, tasks] = await prisma.$transaction([
        prisma.task.count({
            where: whereClause,
        }),
        prisma.task.findMany({
            where: whereClause,
            select: {
                id: true,
                name: true,
                taskSlug: true,
                description: true,
                status: true,
                position: true,
                startDate: true,
                days: true,
                tag: true,
                parentTaskId: true,
                projectId: true,
                createdAt: true,
                updatedAt: true,
                assignee: {
                    select: {
                        id: true,
                        workspaceMember: {
                            select: {
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
                parentTask: {
                    select: {
                        id: true,
                        name: true,
                        taskSlug: true,
                    },
                },
                _count: {
                    select: {
                        subTasks: isMember
                            ? {
                                where: {
                                    assignee: {
                                        workspaceMemberId: workspaceMemberId,
                                    },
                                },
                            }
                            : true,
                        reviewComments: true,
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
        hasMore: skip + tasks.length < totalCount,
        currentPage: page,
    };
}

// ============================================
// CACHED VERSION (Next.js unstable_cache)
// ============================================

/**
 * Cached version of getParentTasksOnly with role-based filtering and pagination
 */
const getCachedParentTasksOnly = (
    projectId: string,
    workspaceId: string,
    userId: string,
    workspaceMemberId: string,
    isMember: boolean,
    page: number,
    pageSize: number
) =>
    unstable_cache(
        async () => _getParentTasksOnlyInternal(projectId, workspaceId, userId, workspaceMemberId, isMember, page, pageSize),
        [`project-parent-tasks-${projectId}-user-${userId}-page-${page}`],
        {
            tags: CacheTags.parentTasksOnly(projectId, userId),
            revalidate: 60, // 1 minute
        }
    )();

// ============================================
// PUBLIC API (React cache wrapper)
// ============================================

/**
 * Get ONLY parent tasks for a project (no subtasks loaded) with pagination
 * This is much faster for initial page load
 * Subtasks should be loaded on-demand when user expands a task
 * 
 * @param projectId - The project ID
 * @param workspaceId - The workspace ID
 * @param page - Page number (default: 1)
 * @param pageSize - Number of tasks per page (default: 10)
 * @returns Object containing array of parent tasks, pagination info
 * 
 * @example
 * ```typescript
 * const { tasks, hasMore, totalCount } = await getParentTasksOnly(projectId, workspaceId, 1, 10);
 * // tasks will only contain first 10 parent tasks, no subtasks
 * // hasMore indicates if there are more tasks to load
 * // Use getSubTasks() to load subtasks on-demand
 * ```
 */
export const getParentTasksOnly = cache(
    async (projectId: string, workspaceId: string, page: number = 1, pageSize: number = 10) => {
        const user = await requireUser();

        try {
            const permissions = await getUserPermissions(workspaceId, projectId);

            if (!permissions.workspaceMemberId) {
                return {
                    tasks: [],
                    totalCount: 0,
                    hasMore: false,
                    currentPage: page
                };
            }

            return await getCachedParentTasksOnly(
                projectId,
                workspaceId,
                user.id,
                permissions.workspaceMemberId,
                permissions.isMember,
                page,
                pageSize
            );
        } catch (error) {
            console.error("Error fetching parent tasks:", error);
            return {
                tasks: [],
                totalCount: 0,
                hasMore: false,
                currentPage: page,
            };
        }
    }
);

// ============================================
// TYPE EXPORTS
// ============================================

export type ParentTasksOnlyResponse = Awaited<ReturnType<typeof getParentTasksOnly>>;
export type ParentTaskType = ParentTasksOnlyResponse['tasks'][number];
