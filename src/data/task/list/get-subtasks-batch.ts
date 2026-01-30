"use server";

import { cache } from "react";
import prisma from "@/lib/db";
import { unstable_cache } from "next/cache";
import { CacheTags } from "@/data/cache-tags";
import { TaskFilters } from "@/types/task-filters";
import { buildSubTaskConditions } from "@/lib/tasks/filter-utils";
import { getUserPermissions, getWorkspacePermissions } from "@/data/user/get-user-permissions";

// ============================================
// TYPES
// ============================================

export type BatchSubTasksResult = {
    parentTaskId: string;
    subTasks: any[];
    totalCount: number;
    hasMore: boolean;
}[];

// ============================================
// INTERNAL FUNCTIONS (Actual DB queries)
// ============================================

/**
 * Internal function to fetch subtasks for multiple parent tasks in a SINGLE query
 * This is the key optimization - instead of N queries, we do 1 query
 */
async function _getSubTasksByParentIdsInternal(
    parentTaskIds: string[],
    workspaceId: string,
    projectId: string,
    userId: string,
    isMember: boolean,
    filters: Partial<TaskFilters> = {},
    pageSize: number = 10
) {
    if (parentTaskIds.length === 0) {
        return [];
    }

    // 1. Get user's project roles for workspace-level permission filtering
    const workspaceMember = await prisma.workspaceMember.findFirst({
        where: {
            workspaceId,
            userId,
        },
    });

    const isWorkspaceAdmin = workspaceMember?.workspaceRole === "OWNER" || workspaceMember?.workspaceRole === "ADMIN";

    // Get all project memberships for this user in this workspace
    const projectMemberships = await prisma.projectMember.findMany({
        where: {
            workspaceMemberId: workspaceMember?.id,
        },
        select: {
            projectId: true,
            projectRole: true,
        },
    });

    // Build a map of projectId -> role
    const projectRoles = new Map<string, string>();
    projectMemberships.forEach(pm => {
        projectRoles.set(pm.projectId, pm.projectRole);
    });

    // 2. Permission filter
    // At workspace level: Check role per project
    // At project level: Use the isMember flag
    let permissionFilter: any;

    if (projectId) {
        // Project-specific view: Use simple isMember check
        // - ADMINS, PROJECT_MANAGERS, and LEADS: See all subtasks (isMember = false)
        // - MEMBERS: Only see subtasks assigned to them (isMember = true)
        permissionFilter = isMember
            ? { assignee: { id: userId } }
            : {};
    } else {
        // Workspace-level view: No simple filter, will filter after fetching
        permissionFilter = {};
    }

    // 3. User applied filters (status, assignee, search, etc.)
    const fullFilters: TaskFilters = {
        workspaceId,
        ...filters
    } as TaskFilters;

    const filterConditions = buildSubTaskConditions(fullFilters);

    // 3. Combine filters
    const whereClause = {
        parentTaskId: { in: parentTaskIds }, // KEY: Fetch for ALL parent IDs at once
        ...permissionFilter,
        ...filterConditions
    };

    // Use $transaction to combine count and data queries for efficiency
    const [totalCountByParent, subTasks] = await prisma.$transaction([
        // Get count grouped by parent
        prisma.task.groupBy({
            by: ['parentTaskId'],
            where: whereClause,
            _count: {
                id: true
            },
            orderBy: {
                parentTaskId: 'asc'
            }
        }),
        // Get actual subtasks
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
            orderBy: [
                { parentTaskId: 'asc' },
                { position: 'asc' },
            ],
            // We'll take first pageSize per parent in the grouping step
            // For now, fetch all and group in memory (can optimize further if needed)
        }),
    ]);

    // Group subtasks by parent task ID
    const groupedSubTasks = new Map<string, any[]>();
    const countMap = new Map<string, number>();

    // Initialize maps
    parentTaskIds.forEach(id => {
        groupedSubTasks.set(id, []);
        countMap.set(id, 0);
    });

    // Populate count map
    totalCountByParent.forEach(item => {
        if (item.parentTaskId && item._count && typeof item._count === 'object' && 'id' in item._count) {
            const countValue = item._count.id;
            if (countValue !== undefined) {
                countMap.set(item.parentTaskId, countValue);
            }
        }
    });

    // Group subtasks with per-project permission filtering
    subTasks.forEach(subTask => {
        if (subTask.parentTaskId) {
            // At workspace level, filter based on user's role in the subtask's project
            if (!projectId) {
                const subTaskProjectId = subTask.projectId;
                const roleInProject = projectRoles.get(subTaskProjectId);

                // Check if user can see this subtask
                const canSeeSubTask =
                    isWorkspaceAdmin || // Workspace admins see all
                    roleInProject === 'PROJECT_MANAGER' || // Project managers see all in their project
                    roleInProject === 'LEAD' || // Leads see all in their project
                    (subTask.assignee && subTask.assignee.id === userId); // Members see only assigned

                if (!canSeeSubTask) {
                    return; // Skip this subtask
                }
            }

            const existing = groupedSubTasks.get(subTask.parentTaskId) || [];
            groupedSubTasks.set(subTask.parentTaskId, [...existing, subTask]);
        }
    });

    // Build result with pagination info
    const result: BatchSubTasksResult = parentTaskIds.map(parentTaskId => {
        const allSubTasks = groupedSubTasks.get(parentTaskId) || [];
        const totalCount = countMap.get(parentTaskId) || 0;

        // Take only first pageSize items per parent
        const paginatedSubTasks = allSubTasks.slice(0, pageSize);

        return {
            parentTaskId,
            subTasks: paginatedSubTasks,
            totalCount,
            hasMore: totalCount > pageSize,
        };
    });

    return result;
}

// ============================================
// CACHED VERSION (Next.js unstable_cache)
// ============================================

/**
 * Generate a hash for filters to use in cache key
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
 * Cached version of batch subtask fetch
 * Cache key includes ALL parent IDs to ensure correctness
 */
const getCachedSubTasksByParentIds = (
    parentTaskIds: string[],
    workspaceId: string,
    projectId: string,
    userId: string,
    isMember: boolean,
    filters: Partial<TaskFilters>,
    pageSize: number
) => {
    // Sort IDs for consistent cache keys
    const sortedIds = [...parentTaskIds].sort().join(',');
    const filterHash = getFilterHash(filters);

    return unstable_cache(
        async () => _getSubTasksByParentIdsInternal(
            parentTaskIds,
            workspaceId,
            projectId,
            userId,
            isMember,
            filters,
            pageSize
        ),
        [`batch-subtasks-${sortedIds}-user-${userId}-member-${isMember}-filters-${filterHash}-size-${pageSize}-v1`],
        {
            // Tag with all parent task IDs for proper invalidation
            tags: [
                ...parentTaskIds.flatMap(id => CacheTags.taskSubTasks(id, userId)),
                `project-subtasks-${projectId}`,
                `workspace-tasks-${workspaceId}`,
            ],
            revalidate: 60, // 1 minute
        }
    )();
};

// ============================================
// PUBLIC API (React cache for request deduplication)
// ============================================

/**
 * Get subtasks for multiple parent tasks in a SINGLE database query
 * 
 * This is the KEY optimization for expand/collapse performance:
 * - Instead of N separate queries when expanding N tasks
 * - We make 1 query that fetches subtasks for ALL parent tasks
 * - Results are grouped by parent task ID
 * - Each parent gets its own pagination info
 * 
 * Filtering Rules (same as single-parent version):
 * - ADMINs and LEADs: See all subtasks
 * - MEMBERs: Only see subtasks assigned to them
 * 
 * @param parentTaskIds - Array of parent task IDs to fetch subtasks for
 * @param workspaceId - The workspace ID
 * @param projectId - The project ID (optional, can be undefined for workspace-level)
 * @param filters - Optional filters to apply to subtasks
 * @param pageSize - Number of items per parent task (default: 10)
 * @returns Array of results, one per parent task, with subtasks and pagination info
 * 
 * @example
 * // Fetch subtasks for 5 parent tasks in one query
 * const results = await getSubTasksByParentIds(
 *   ['task1', 'task2', 'task3', 'task4', 'task5'],
 *   workspaceId,
 *   projectId
 * );
 * // results[0].parentTaskId === 'task1'
 * // results[0].subTasks === [...subtasks for task1]
 * // results[0].hasMore === true/false
 */
export const getSubTasksByParentIds = cache(
    async (
        parentTaskIds: string[],
        workspaceId: string,
        projectId?: string,
        filters: Partial<TaskFilters> = {},
        pageSize: number = 10
    ): Promise<BatchSubTasksResult> => {
        try {
            if (parentTaskIds.length === 0) {
                return [];
            }

            // Get permissions - use workspace or project level based on projectId
            let permissions;
            let isMember = false;

            if (projectId) {
                permissions = await getUserPermissions(workspaceId, projectId);
                isMember = permissions.isMember;
            } else {
                permissions = await getWorkspacePermissions(workspaceId);
                // Workspace permissions don't have isMember, but workspace admins see all
                isMember = !permissions.isWorkspaceAdmin;
            }

            if (!permissions.workspaceMemberId) {
                throw new Error("User does not have access to this workspace");
            }

            return await getCachedSubTasksByParentIds(
                parentTaskIds,
                workspaceId,
                projectId || '', // Use empty string if undefined
                permissions.workspaceMember.userId,
                isMember,
                filters,
                pageSize
            );
        } catch (error) {
            console.error("Error fetching batch subtasks:", error);
            // Return empty results for all requested parents
            return parentTaskIds.map(parentTaskId => ({
                parentTaskId,
                subTasks: [],
                totalCount: 0,
                hasMore: false,
            }));
        }
    }
);

// ============================================
// TYPE EXPORTS
// ============================================

export type BatchSubTasksResponse = Awaited<ReturnType<typeof getSubTasksByParentIds>>;
export type BatchSubTaskItem = BatchSubTasksResponse[number];
