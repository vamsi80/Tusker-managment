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
 * Internal function to fetch all tasks (parent + subtasks) as a flat list
 * with role-based filtering
 */
async function _getAllTasksFlatInternal(
    projectId: string,
    workspaceId: string,
    userId: string,
    workspaceMemberId: string,
    isMember: boolean
) {
    // Build the where clause based on user role
    const whereClause = isMember
        ? {
            projectId: projectId,
            OR: [
                // Parent tasks where user has assigned subtasks
                {
                    parentTaskId: null,
                    subTasks: {
                        some: {
                            assignee: {
                                workspaceMemberId: workspaceMemberId,
                            },
                        },
                    },
                },
                // Subtasks assigned to the user
                {
                    parentTaskId: { not: null },
                    assignee: {
                        workspaceMemberId: workspaceMemberId,
                    },
                },
            ],
        }
        : {
            projectId: projectId,
        };

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
            parentTask: {
                select: {
                    id: true,
                    name: true,
                    taskSlug: true,
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
        orderBy: [
            {
                parentTaskId: 'asc', // Parent tasks first (null comes first)
            },
            {
                position: 'asc',
            },
        ],
    });

    return { tasks };
}

// ============================================
// CACHED VERSION (Next.js unstable_cache)
// ============================================

/**
 * Cached version of getAllTasksFlat with role-based filtering
 */
const getCachedAllTasksFlat = (
    projectId: string,
    workspaceId: string,
    userId: string,
    workspaceMemberId: string,
    isMember: boolean
) =>
    unstable_cache(
        async () => _getAllTasksFlatInternal(projectId, workspaceId, userId, workspaceMemberId, isMember),
        [`project-all-tasks-flat-${projectId}-user-${userId}`],
        {
            tags: [`project-tasks-${projectId}`, `project-tasks-user-${userId}`, `project-tasks-flat`],
            revalidate: 60, // 1 minute
        }
    )();

// ============================================
// PUBLIC API (React cache for request deduplication)
// ============================================

/**
 * Get all tasks (parent tasks and subtasks) as a flat list for a project with role-based filtering
 * 
 * Returns a flat array containing both parent tasks and subtasks.
 * Parent tasks have `parentTaskId: null`, subtasks have a `parentTaskId` value.
 * 
 * Filtering Rules:
 * - ADMINs and LEADs: See all tasks and subtasks
 * - MEMBERs: Only see parent tasks that have at least one subtask assigned to them
 *           and only see their assigned subtasks
 * 
 * @param projectId - The project ID
 * @param workspaceId - The workspace ID
 * @returns Object containing flat array of all tasks and subtasks
 * 
 * @example
 * const { tasks } = await getAllTasksFlat(projectId, workspaceId);
 * // tasks is a flat array containing both parent tasks and subtasks
 * // Filter by parentTaskId === null to get only parent tasks
 * // Filter by parentTaskId !== null to get only subtasks
 */
export const getAllTasksFlat = cache(
    async (projectId: string, workspaceId: string) => {
        const user = await requireUser();

        try {
            // Get user's permissions using the centralized function
            const permissions = await getUserPermissions(workspaceId, projectId);

            if (!permissions.workspaceMemberId) {
                throw new Error("User does not have access to this project");
            }

            return await getCachedAllTasksFlat(
                projectId,
                workspaceId,
                user.id,
                permissions.workspaceMemberId,
                permissions.isMember
            );
        } catch (error) {
            console.error("Error fetching flat tasks:", error);
            return {
                tasks: [],
            };
        }
    }
);

// ============================================
// TYPE EXPORTS
// ============================================

export type AllTasksFlatResponse = Awaited<ReturnType<typeof getAllTasksFlat>>;
export type FlatTaskType = AllTasksFlatResponse['tasks'][number];
