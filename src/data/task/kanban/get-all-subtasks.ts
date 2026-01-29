"use server";

import { cache } from "react";
import prisma from "@/lib/db";
import { unstable_cache } from "next/cache";
import { requireUser } from "@/lib/auth/require-user";
import { getUserPermissions } from "@/data/user/get-user-permissions";
import { CacheTags } from "@/data/cache-tags";

// ============================================
// INTERNAL FUNCTIONS (Actual DB queries)
// ============================================

/**
 * Internal function to fetch all subtasks for Kanban view
 * with role-based filtering
 */
async function _getAllSubTasksInternal(
    projectId: string,
    workspaceId: string,
    workspaceMemberId: string,
    userId: string,
    isMember: boolean
) {
    // Build where clause based on role
    const whereClause = isMember
        ? {
            parentTask: {
                projectId: projectId,
            },
            assignee: {
                id: userId,
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
            tag: {
                select: {
                    id: true,
                    name: true,

                },
            },
            projectId: true,
            parentTaskId: true,
            createdAt: true,
            updatedAt: true,
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
                    name: true,
                    surname: true,
                    image: true,
                },
            },
            createdBy: {
                select: {
                    id: true,
                    name: true,
                    surname: true,
                    image: true,
                },
            },
            _count: {
                select: {
                    subTasks: isMember
                        ? {
                            where: {
                                assignee: {
                                    id: userId,
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

    return { subTasks };
}

// ============================================
// CACHED VERSION (Next.js unstable_cache)
// ============================================

/**
 * Cached version of getAllSubTasks with role-based filtering
 */
const getCachedAllSubTasks = (
    projectId: string,
    workspaceId: string,
    workspaceMemberId: string,
    userId: string,
    isMember: boolean
) =>
    unstable_cache(
        async () => _getAllSubTasksInternal(projectId, workspaceId, workspaceMemberId, userId, isMember),
        [`project-all-subtasks-${projectId}-member-${workspaceMemberId}-user-${userId}`],
        {
            tags: CacheTags.projectSubTasks(projectId),
            revalidate: 60, // 1 minute
        }
    )();

// ============================================
// PUBLIC API (React cache for request deduplication)
// ============================================

/**
 * Get all subtasks for a project (for Kanban view)
 * 
 * Returns only subtasks (not parent tasks) with parent task information.
 * This is specifically designed for the Kanban board which displays subtasks
 * grouped by status.
 * 
 * Filtering Rules:
 * - ADMINs and LEADs: See all subtasks
 * - MEMBERs: Only see subtasks assigned to them
 * 
 * @param projectId - The project ID
 * @param workspaceId - The workspace ID
 * @returns Object containing array of subtasks with parent task info
 * 
 * @example
 * const { subTasks } = await getAllSubTasks(projectId, workspaceId);
 * // subTasks is an array of subtasks only
 * // Each subtask has parentTask: { id, name, taskSlug }
 * // Group by status for Kanban columns
 */
export const getAllSubTasks = cache(
    async (projectId: string, workspaceId: string) => {

        try {
            // Get user's permissions using the centralized function
            const permissions = await getUserPermissions(workspaceId, projectId);

            if (!permissions.workspaceMemberId) {
                throw new Error("User does not have access to this project");
            }

            return await getCachedAllSubTasks(
                projectId,
                workspaceId,
                permissions.workspaceMemberId,
                permissions.workspaceMember.userId,
                permissions.isMember
            );
        } catch (error) {
            console.error("Error fetching all subtasks:", error);
            return {
                subTasks: [],
            };
        }
    }
);

// ============================================
// TYPE EXPORTS
// ============================================

export type AllSubTasksResponse = Awaited<ReturnType<typeof getAllSubTasks>>;
export type SubTaskType = AllSubTasksResponse['subTasks'][number];
