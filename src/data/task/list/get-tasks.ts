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
 * Internal function to fetch project tasks with role-based filtering
 * - ADMINs and LEADs see all parent tasks with all subtasks
 * - MEMBERs only see parent tasks that have at least one subtask assigned to them
 */
async function _getProjectTasksInternal(
    projectId: string,
    workspaceId: string,
    userId: string,
    workspaceMemberId: string,
    isMember: boolean,
    page: number,
    pageSize: number
) {
    const skip = (page - 1) * pageSize;

    // Build the where clause based on user role
    const whereClause = isMember
        ? {
            projectId: projectId,
            parentTaskId: null,
            // Only show parent tasks that have at least one subtask assigned to this user
            subTasks: {
                some: {
                    assignee: {
                        workspaceMemberId: workspaceMemberId,
                    },
                },
            },
        }
        : {
            projectId: projectId,
            parentTaskId: null,
        };

    // Use $transaction to combine count and data queries
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
                projectId: true,
                createdBy: {
                    select: {
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
                    select: {
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
                // Include subtasks with filtering for members
                subTasks: isMember
                    ? {
                        where: {
                            assignee: {
                                workspaceMemberId: workspaceMemberId,
                            },
                        },
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
                            assignee: {
                                select: {
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
                        },
                        orderBy: {
                            position: 'asc',
                        },
                    }
                    : {
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
                            assignee: {
                                select: {
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
                        },
                        orderBy: {
                            position: 'asc',
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
 * Internal function to fetch subtasks with role-based filtering
 */
async function _getTaskSubTasksInternal(
    parentTaskId: string,
    workspaceId: string,
    projectId: string,
    workspaceMemberId: string,
    isMember: boolean,
    page: number,
    pageSize: number
) {
    const skip = (page - 1) * pageSize;

    // Build the where clause based on user role
    const whereClause = isMember
        ? {
            parentTaskId: parentTaskId,
            assignee: {
                workspaceMemberId: workspaceMemberId,
            },
        }
        : {
            parentTaskId: parentTaskId,
        };

    // Use $transaction to combine count and data queries
    const [totalCount, subTasks] = await prisma.$transaction([
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
                assignee: {
                    select: {
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
 * Cached version of getProjectTasks with role-based filtering
 */
const getCachedProjectTasks = (
    projectId: string,
    workspaceId: string,
    userId: string,
    workspaceMemberId: string,
    isMember: boolean,
    page: number,
    pageSize: number
) =>
    unstable_cache(
        async () =>
            _getProjectTasksInternal(projectId, workspaceId, userId, workspaceMemberId, isMember, page, pageSize),
        [`project-tasks-${projectId}-user-${userId}-page-${page}-size-${pageSize}`],
        {
            tags: CacheTags.projectTasks(projectId, userId),
            revalidate: 60,
        }
    )();

/**
 * Cached version of getTaskSubTasks with role-based filtering
 */
const getCachedTaskSubTasks = (
    parentTaskId: string,
    workspaceId: string,
    projectId: string,
    workspaceMemberId: string,
    isMember: boolean,
    page: number,
    pageSize: number
) =>
    unstable_cache(
        async () => _getTaskSubTasksInternal(parentTaskId, workspaceId, projectId, workspaceMemberId, isMember, page, pageSize),
        [`task-subtasks-${parentTaskId}-member-${workspaceMemberId}-page-${page}-size-${pageSize}`],
        {
            tags: CacheTags.taskSubTasks(parentTaskId, workspaceMemberId),
            revalidate: 60,
        }
    )();

// ============================================
// PUBLIC API (React cache for request deduplication)
// ============================================

/**
 * Get parent tasks with role-based filtering and pagination
 * 
 * Filtering Rules:
 * - ADMINs and LEADs: See all parent tasks with all subtasks
 * - MEMBERs: Only see parent tasks that have at least one subtask assigned to them
 *           and only see their assigned subtasks
 * 
 * Returns minimal task fields for performance
 */
export const getProjectTasks = cache(
    async (projectId: string, workspaceId: string, page: number = 1, pageSize: number = 10) => {
        const user = await requireUser();

        try {
            // Get user's permissions using the centralized function
            const permissions = await getUserPermissions(workspaceId, projectId);

            if (!permissions.workspaceMemberId) {
                throw new Error("User does not have access to this project");
            }

            return await getCachedProjectTasks(
                projectId,
                workspaceId,
                user.id,
                permissions.workspaceMemberId,
                permissions.isMember,
                page,
                pageSize
            );
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
    }
);

export type ProjectTasksResponse = Awaited<ReturnType<typeof getProjectTasks>>;
export type ProjectTaskType = ProjectTasksResponse['tasks'];
