"use server";

import { cache } from "react";
import { unstable_cache } from "next/cache";
import prisma from "@/lib/db";
import { requireUser } from "@/app/data/user/require-user";
import { getUserPermissions } from "@/app/data/user/get-user-permissions";

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
                createdAt: true,
                updatedAt: true,
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
                            dependsOn: {
                                select: {
                                    id: true,
                                    name: true,
                                    status: true,
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
                            dependsOn: {
                                select: {
                                    id: true,
                                    name: true,
                                    status: true,
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
                dependsOn: {
                    select: {
                        id: true,
                        name: true,
                        status: true,
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
            tags: [`project-tasks-${projectId}`, `project-tasks-user-${userId}`, `project-tasks-all`],
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
            tags: [`task-subtasks-${parentTaskId}`, `task-subtasks-member-${workspaceMemberId}`, `task-subtasks-all`],
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

/**
 * Get subtasks for a specific parent task with role-based filtering
 * 
 * Filtering Rules:
 * - ADMINs and LEADs: See all subtasks
 * - MEMBERs: Only see subtasks assigned to them
 */
export const getTaskSubTasks = cache(
    async (parentTaskId: string, workspaceId: string, projectId: string, page: number = 1, pageSize: number = 10) => {
        const user = await requireUser();

        try {
            // Get user's permissions using the centralized function
            const permissions = await getUserPermissions(workspaceId, projectId);

            if (!permissions.workspaceMemberId) {
                throw new Error("User does not have access to this project");
            }

            return await getCachedTaskSubTasks(
                parentTaskId,
                workspaceId,
                projectId,
                permissions.workspaceMemberId,
                permissions.isMember,
                page,
                pageSize
            );
        } catch (error) {
            console.error("Error fetching subtasks:", error);
            return {
                subTasks: [],
                totalCount: 0,
                hasMore: false,
                currentPage: 1,
            };
        }
    }
);

/**
 * Get all subtasks across all tasks in a project for Kanban view
 * Includes parent task information for filtering
 */
export const getAllProjectSubTasks = cache(
    async (projectId: string, workspaceId: string) => {

        try {
            // Get user's permissions
            const permissions = await getUserPermissions(workspaceId, projectId);

            if (!permissions.workspaceMemberId) {
                throw new Error("User does not have access to this project");
            }

            // Build where clause based on role
            const whereClause = permissions.isMember
                ? {
                    parentTask: {
                        projectId: projectId,
                    },
                    assignee: {
                        workspaceMemberId: permissions.workspaceMemberId,
                    },
                }
                : {
                    parentTask: {
                        projectId: projectId,
                    },
                };

            const subTasks = await prisma.task.findMany({
                where: {
                    ...whereClause,
                    parentTaskId: { not: null }, // Only subtasks
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
                    parentTaskId: true,
                    parentTask: {
                        select: {
                            id: true,
                            name: true,
                            taskSlug: true,
                        },
                    },
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
                    dependsOn: {
                        select: {
                            id: true,
                            name: true,
                            status: true,
                        },
                    },
                    _count: {
                        select: {
                            reviewComments: true, // Count of review comments
                        },
                    },
                },
                orderBy: {
                    position: 'asc',
                },
            });

            return { subTasks };
        } catch (error) {
            console.error("Error fetching all subtasks:", error);
            return { subTasks: [] };
        }
    }
);

// ============================================
// TYPE EXPORTS
// ============================================

export type ProjectTasksResponse = Awaited<ReturnType<typeof getProjectTasks>>;
export type ProjectTaskType = ProjectTasksResponse['tasks'];
export type SubTasksResponse = Awaited<ReturnType<typeof getTaskSubTasks>>;
export type SubTaskType = SubTasksResponse['subTasks'];
export type AllSubTasksResponse = Awaited<ReturnType<typeof getAllProjectSubTasks>>;
export type AllSubTaskType = AllSubTasksResponse['subTasks'];
