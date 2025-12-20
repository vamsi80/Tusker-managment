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
 * Internal function to fetch subtasks with role-based filtering and pagination
 */
async function _getSubTasksInternal(
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
                // Removed dependsOn - not needed for subtasks list
                // Removed parentTask - we already know the parent
                _count: {
                    select: {
                        reviewComments: true,
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
        subTasks,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
        currentPage: page,
        hasMore: skip + subTasks.length < totalCount,
    };
}

// ============================================
// CACHED VERSION (Next.js unstable_cache)
// ============================================

/**
 * Cached version of getSubTasks with role-based filtering
 */
const getCachedSubTasks = (
    parentTaskId: string,
    workspaceId: string,
    projectId: string,
    workspaceMemberId: string,
    isMember: boolean,
    page: number,
    pageSize: number
) =>
    unstable_cache(
        async () => _getSubTasksInternal(parentTaskId, workspaceId, projectId, workspaceMemberId, isMember, page, pageSize),
        [`task-subtasks-${parentTaskId}-member-${workspaceMemberId}-page-${page}-size-${pageSize}`],
        {
            tags: [`task-subtasks-${parentTaskId}`, `task-subtasks-member-${workspaceMemberId}`, `task-subtasks-all`],
            revalidate: 60, // 1 minute
        }
    )();

// ============================================
// PUBLIC API (React cache for request deduplication)
// ============================================

/**
 * Get subtasks for a specific parent task with role-based filtering and pagination
 * 
 * Filtering Rules:
 * - ADMINs and LEADs: See all subtasks
 * - MEMBERs: Only see subtasks assigned to them
 * 
 * @param parentTaskId - The parent task ID
 * @param workspaceId - The workspace ID
 * @param projectId - The project ID
 * @param page - Page number (default: 1)
 * @param pageSize - Number of items per page (default: 10)
 * @returns Object containing subtasks array and pagination info
 * 
 * @example
 * const { subTasks, totalCount, hasMore } = await getSubTasks(
 *   parentTaskId,
 *   workspaceId,
 *   projectId,
 *   1,
 *   10
 * );
 */
export const getSubTasks = cache(
    async (
        parentTaskId: string,
        workspaceId: string,
        projectId: string,
        page: number = 1,
        pageSize: number = 10
    ) => {
        const user = await requireUser();

        try {
            // Get user's permissions using the centralized function
            const permissions = await getUserPermissions(workspaceId, projectId);

            if (!permissions.workspaceMemberId) {
                throw new Error("User does not have access to this project");
            }

            return await getCachedSubTasks(
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
                totalPages: 0,
                currentPage: 1,
                hasMore: false,
            };
        }
    }
);

// ============================================
// TYPE EXPORTS
// ============================================

export type SubTasksResponse = Awaited<ReturnType<typeof getSubTasks>>;
export type SubTaskType = SubTasksResponse['subTasks'][number];
