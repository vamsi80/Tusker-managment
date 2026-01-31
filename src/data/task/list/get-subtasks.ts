"use server";

import { cache } from "react";
import { unstable_cache } from "next/cache";
import prisma from "@/lib/db";
import { getUserPermissions } from "@/data/user/get-user-permissions";
import { CacheTags } from "@/data/cache-tags";
import { TaskFilters } from "@/types/task-filters";
import { buildSubTaskConditions } from "@/lib/tasks/filter-utils";

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
    userId: string,
    isMember: boolean,
    filters: Partial<TaskFilters> = {}, // Allow partial here
    page: number,
    pageSize: number
) {
    const skip = (page - 1) * pageSize;

    // 1. Permission filter
    // - ADMINS, PROJECT_MANAGERS, and LEADS: See all subtasks (isMember = false)
    // - MEMBERS: Only see subtasks assigned to them (isMember = true)
    const permissionFilter = isMember
        ? { assignee: { id: userId } }
        : {};

    // 2. User applied filters (status, assignee, search, etc.)
    // Ensure workspaceId is present for buildSubTaskConditions
    const fullFilters: TaskFilters = {
        workspaceId,
        ...filters
    } as TaskFilters;

    const filterConditions = buildSubTaskConditions(fullFilters);

    // 3. Combine filters
    const whereClause = {
        parentTaskId: parentTaskId,
        ...permissionFilter,
        ...filterConditions
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
                dueDate: true,
                days: true,
                tag: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
                parentTaskId: true,
                projectId: true,
                createdAt: true,
                updatedAt: true,
                assignee: {
                    select: {
                        id: true,
                        name: true,
                        surname: true,
                        image: true,
                    },
                },
                reviewerId: true,
                reviewer: {
                    select: {
                        id: true,
                        name: true,
                        surname: true,
                        image: true,
                    },
                },
                _count: {
                    select: {
                        reviewComments: true,
                        subTasks: true,
                    },
                },
                createdById: true,
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
 * Generate a hash for filters to usage in cache key
 */
/**
 * Generate a hash for filters to usage in cache key
 */
function getFilterHash(filters: Partial<TaskFilters>): string {
    return JSON.stringify({
        status: filters.status,
        assigneeId: filters.assigneeId,
        tagId: filters.tagId,
        search: filters.search,
        dueAfter: filters.dueAfter,
        dueBefore: filters.dueBefore,
    });
}

/**
 * Cached version of getSubTasks with role-based filtering
 */
const getCachedSubTasks = (
    parentTaskId: string,
    workspaceId: string,
    projectId: string,
    userId: string,
    isMember: boolean,
    filters: Partial<TaskFilters>,
    page: number,
    pageSize: number
) => {
    const filterHash = getFilterHash(filters);

    return unstable_cache(
        async () => _getSubTasksInternal(parentTaskId, workspaceId, projectId, userId, isMember, filters, page, pageSize),
        [`task-subtasks-${parentTaskId}-user-${userId}-member-${isMember}-filters-${filterHash}-page-${page}-size-${pageSize}-v1`],
        {
            tags: CacheTags.taskSubTasks(parentTaskId, userId),
            revalidate: 60, // 1 minute
        }
    )();
};

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
 * @param filters - Optional filters to apply to subtasks
 * @param page - Page number (default: 1)
 * @param pageSize - Number of items per page (default: 10)
 * @returns Object containing subtasks array and pagination info
 */
export const getSubTasks = cache(
    async (
        parentTaskId: string,
        workspaceId: string,
        projectId: string,
        filters: Partial<TaskFilters> = {},
        page: number = 1,
        pageSize: number = 10
    ) => {
        try {
            const permissions = await getUserPermissions(workspaceId, projectId);

            if (!permissions.workspaceMemberId) {
                throw new Error("User does not have access to this project");
            }

            return await getCachedSubTasks(
                parentTaskId,
                workspaceId,
                projectId,
                permissions.workspaceMember.userId,
                permissions.isMember,
                filters,
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
