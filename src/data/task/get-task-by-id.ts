"use server";

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { notFound } from "next/navigation";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/auth/require-user";
import { getUserPermissions } from "@/data/user/get-user-permissions";

// ============================================
// INTERNAL FUNCTIONS (Actual DB queries)
// ============================================

/**
 * Internal function to fetch a single task by ID with full details
 * Includes role-based access control
 */
async function _getTaskByIdInternal(
    taskId: string,
    workspaceId: string,
    projectId: string,
    workspaceMemberId: string,
    isMember: boolean
) {
    const task = await prisma.task.findUnique({
        where: { id: taskId },
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
                            email: true,
                        },
                    },
                },
            },
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
                                    email: true,
                                },
                            },
                        },
                    },
                },
            },
            project: {
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    workspaceId: true,
                },
            },
            parentTask: {
                select: {
                    id: true,
                    name: true,
                    taskSlug: true,
                    status: true,
                },
            },
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
    });

    // If task not found, return null
    if (!task) {
        return null;
    }

    // Check access permissions for members
    if (isMember) {
        // If it's a subtask, check if user is assigned
        if (task.parentTaskId) {
            const isAssigned = task.assignee?.workspaceMember?.id === workspaceMemberId;
            if (!isAssigned) {
                return null; // Member doesn't have access to this subtask
            }
        } else {
            // If it's a parent task, check if user has any assigned subtasks
            const hasAssignedSubtasks = task.subTasks && task.subTasks.length > 0;
            if (!hasAssignedSubtasks) {
                return null; // Member doesn't have access to this parent task
            }
        }
    }

    return task;
}

// ============================================
// CACHED VERSION (Next.js unstable_cache)
// ============================================

/**
 * Cached version of getTaskById with role-based filtering
 */
const getCachedTaskById = (
    taskId: string,
    workspaceId: string,
    projectId: string,
    workspaceMemberId: string,
    isMember: boolean
) =>
    unstable_cache(
        async () => _getTaskByIdInternal(taskId, workspaceId, projectId, workspaceMemberId, isMember),
        [`task-${taskId}-user-member-${workspaceMemberId}`],
        {
            tags: [`task-${taskId}`, `project-tasks-${projectId}`, `task-details`],
            revalidate: 60, // 1 minute
        }
    )();

// ============================================
// PUBLIC API (React cache for request deduplication)
// ============================================

/**
 * Get a single task by ID with full details and role-based access control
 * 
 * Access Rules:
 * - ADMINs and LEADs: Can access any task in the project
 * - MEMBERs: Can only access:
 *   - Subtasks assigned to them
 *   - Parent tasks that have at least one subtask assigned to them
 * 
 * @param taskId - The task ID
 * @param workspaceId - The workspace ID
 * @param projectId - The project ID
 * @returns Task object or calls notFound() if not found/no access
 * 
 * @example
 * const task = await getTaskById(taskId, workspaceId, projectId);
 */
export const getTaskById = cache(
    async (taskId: string, workspaceId: string, projectId: string) => {
        const user = await requireUser();

        try {
            // Get user's permissions using the centralized function
            const permissions = await getUserPermissions(workspaceId, projectId);

            if (!permissions.workspaceMemberId) {
                return notFound();
            }

            const task = await getCachedTaskById(
                taskId,
                workspaceId,
                projectId,
                permissions.workspaceMemberId,
                permissions.isMember
            );

            if (!task) {
                return notFound();
            }

            return task;
        } catch (error) {
            console.error("Error fetching task by ID:", error);
            return notFound();
        }
    }
);

// ============================================
// TYPE EXPORTS
// ============================================

export type TaskByIdType = Awaited<ReturnType<typeof getTaskById>>;
