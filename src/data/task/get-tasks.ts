"use server";

import { cache } from "react";
import { unstable_cache } from "next/cache";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/auth/require-user";
import { getUserPermissions } from "@/data/user/get-user-permissions";

// ============================================
// INTERNAL FUNCTIONS (Actual DB queries)
// ============================================

/**
 * Internal function to fetch parent tasks with nested subtasks for a project
 * with role-based filtering
 */
async function _getTasksInternal(
    projectId: string,
    workspaceId: string,
    userId: string,
    workspaceMemberId: string,
    isMember: boolean
) {
    // Build the where clause for parent tasks based on user role
    const whereClause = isMember
        ? {
            projectId: projectId,
            parentTaskId: null, // Only parent tasks
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
            parentTaskId: null, // Only parent tasks
        };

    // Fetch parent tasks with nested subtasks
    const tasks = await prisma.task.findMany({
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
            parentTaskId: true,
            createdAt: true,
            updatedAt: true,
            createdBy: {
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
            // Nested subtasks with full details
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
                        parentTaskId: true,
                        createdAt: true,
                        updatedAt: true,
                        assignee: {
                            select: {
                                id: true,
                                workspaceMember: {
                                    select: {
                                        id: true,
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
                                reviewComments: true,
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
                        parentTaskId: true,
                        createdAt: true,
                        updatedAt: true,
                        assignee: {
                            select: {
                                id: true,
                                workspaceMember: {
                                    select: {
                                        id: true,
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
                                reviewComments: true,
                            },
                        },
                    },
                    orderBy: {
                        position: 'asc',
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
    });

    return { tasks };
}

// ============================================
// CACHED VERSION (Next.js unstable_cache)
// ============================================

/**
 * Cached version of getTasks with role-based filtering
 */
const getCachedTasks = (
    projectId: string,
    workspaceId: string,
    userId: string,
    workspaceMemberId: string,
    isMember: boolean
) =>
    unstable_cache(
        async () => _getTasksInternal(projectId, workspaceId, userId, workspaceMemberId, isMember),
        [`project-all-tasks-${projectId}-user-${userId}`],
        {
            tags: [`project-tasks-${projectId}`, `project-tasks-user-${userId}`, `project-tasks-all`],
            revalidate: 60, // 1 minute
        }
    )();

// ============================================
// PUBLIC API (React cache for request deduplication)
// ============================================

/**
 * Get parent tasks with nested subtasks for a project with role-based filtering
 * 
 * Returns a hierarchical structure where only parent tasks are at the top level,
 * each containing their subtasks in the `subTasks` array.
 * 
 * Filtering Rules:
 * - ADMINs and LEADs: See all parent tasks with all their subtasks
 * - MEMBERs: Only see parent tasks that have at least one subtask assigned to them,
 *           and only see their assigned subtasks within those parent tasks
 * 
 * @param projectId - The project ID
 * @param workspaceId - The workspace ID
 * @returns Object containing array of parent tasks with nested subtasks
 * 
 * @example
 * const { tasks } = await getTasks(projectId, workspaceId);
 * // tasks is an array of parent tasks
 * // Each parent task has a subTasks array containing its subtasks
 */
export const getTasks = cache(
    async (projectId: string, workspaceId: string) => {
        const user = await requireUser();

        try {
            // Get user's permissions using the centralized function
            const permissions = await getUserPermissions(workspaceId, projectId);

            if (!permissions.workspaceMemberId) {
                throw new Error("User does not have access to this project");
            }

            return await getCachedTasks(
                projectId,
                workspaceId,
                user.id,
                permissions.workspaceMemberId,
                permissions.isMember
            );
        } catch (error) {
            console.error("Error fetching tasks:", error);
            return {
                tasks: [],
            };
        }
    }
);

// ============================================
// TYPE EXPORTS
// ============================================

export type TasksResponse = Awaited<ReturnType<typeof getTasks>>;
export type TaskType = TasksResponse['tasks'][number];
