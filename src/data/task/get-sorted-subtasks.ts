"use server";

import prisma from "@/lib/db";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { TaskStatus } from "@/generated/prisma";
import { getWorkspacePermissions, getUserPermissions } from "@/data/user/get-user-permissions";
import { CacheTags } from "@/data/cache-tags";
import { TaskFilters } from "@/types/task-filters";
import { buildSubTaskConditions } from "@/lib/tasks/filter-utils";
import { SortConfig } from "@/components/task/shared/types";

/**
 * Status order mapping for custom status sorting
 * This ensures statuses are sorted in business logic order, not alphabetically
 */
const STATUS_ORDER: Record<TaskStatus, number> = {
    TO_DO: 1,
    IN_PROGRESS: 2,
    REVIEW: 3,
    COMPLETED: 4,
    HOLD: 5,
    CANCELLED: 6,
};

/**
 * Helper to build Prisma orderBy clause from sort configuration
 */
function buildOrderBy(sorts: SortConfig[]) {
    if (!sorts || sorts.length === 0) {
        return [{ position: 'asc' as const }];
    }

    return sorts.map(sort => {
        switch (sort.field) {
            case 'name':
                return { name: sort.direction };
            case 'assignee':
                return { assignee: { name: sort.direction } };
            case 'reviewer':
                return { reviewer: { name: sort.direction } };
            case 'status':
                // For status, we'll need to handle this with a custom approach
                // Since Prisma doesn't support custom ordering directly
                return { status: sort.direction };
            case 'startDate':
                return { startDate: sort.direction };
            case 'dueDate':
                return { dueDate: sort.direction };
            case 'progress':
                return { progress: sort.direction };
            case 'tags':
                return { tag: { name: sort.direction } };
            default:
                return { position: 'asc' as const };
        }
    });
}

/**
 * Apply custom status ordering in memory
 * This is necessary because Prisma doesn't support custom enum ordering
 */
function applyStatusOrdering(tasks: any[], sortDirection: 'asc' | 'desc') {
    return tasks.sort((a, b) => {
        const orderA = STATUS_ORDER[a.status as TaskStatus] || 999;
        const orderB = STATUS_ORDER[b.status as TaskStatus] || 999;
        return sortDirection === 'asc' ? orderA - orderB : orderB - orderA;
    });
}

/**
 * Get sorted (flattened) subtasks grouped by project
 * This function fetches ALL subtasks (at any depth) and sorts them within each project
 */
async function _getSortedSubTasksInternal(
    workspaceId: string,
    workspaceMemberId: string,
    userId: string,
    isAdmin: boolean,
    fullAccessProjectIds: string[],
    filters: TaskFilters,
    sorts: SortConfig[] = [],
    page: number = 1,
    pageSize: number = 50
) {
    // ========================================================================
    // STEP 1: Get Authorized Project IDs (Permission Layer)
    // ========================================================================
    let authorizedProjectIds: string[] | undefined = undefined;

    if (!isAdmin) {
        const projects = await prisma.projectMember.findMany({
            where: {
                workspaceMemberId: workspaceMemberId,
                hasAccess: true,
            },
            select: { projectId: true }
        });
        authorizedProjectIds = projects.map(p => p.projectId);

        if (authorizedProjectIds.length === 0) {
            return {
                tasksByProject: {},
                totalCount: 0,
                hasMore: false,
            };
        }
    }

    // ========================================================================
    // STEP 2: Build WHERE Clause for Subtasks
    // ========================================================================
    const toArray = <T>(val: T | T[] | undefined): T[] | undefined => {
        if (val === undefined) return undefined;
        return Array.isArray(val) ? val : [val];
    };

    const baseFilterInput: TaskFilters = {
        workspaceId,
        projectId: filters.projectId,
        status: toArray(filters.status),
        assigneeId: toArray(filters.assigneeId),
        tagId: toArray(filters.tagId),
        search: filters.search,
        dueAfter: filters.dueAfter,
        dueBefore: filters.dueBefore,
    };

    // Build subtask conditions
    const subTaskConditions = buildSubTaskConditions(baseFilterInput);

    // Base where clause for subtasks
    const where: any = {
        workspaceId,
        parentTaskId: { not: null }, // CRITICAL: Only fetch subtasks
        projectId: authorizedProjectIds ? { in: authorizedProjectIds } : undefined,
        ...subTaskConditions,
    };

    // Apply project filter if specified
    if (filters.projectId) {
        where.projectId = filters.projectId;
    }

    // ========================================================================
    // STEP 3: Build OrderBy Clause
    // ========================================================================
    const orderBy = buildOrderBy(sorts);

    // ========================================================================
    // STEP 4: Execute Query
    // ========================================================================
    const hasStatusSort = sorts.some(s => s.field === 'status');

    // Fetch tasks
    let tasks = await prisma.task.findMany({
        where,
        select: {
            id: true,
            name: true,
            taskSlug: true,
            description: true,
            status: true,
            position: true,
            startDate: true,
            days: true,
            projectId: true,
            parentTaskId: true,
            createdAt: true,
            updatedAt: true,
            tag: {
                select: { id: true, name: true }
            },
            project: {
                select: { id: true, name: true, slug: true, color: true }
            },
            assignee: {
                select: { id: true, name: true, surname: true, image: true }
            },
            reviewer: {
                select: { id: true, name: true, surname: true, image: true }
            },
            parentTask: {
                select: {
                    id: true,
                    name: true,
                    taskSlug: true,
                }
            },
            _count: {
                select: { subTasks: true }
            }
        },
        orderBy: hasStatusSort ? undefined : orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
    });

    // Apply custom status ordering if needed
    if (hasStatusSort) {
        const statusSort = sorts.find(s => s.field === 'status')!;
        tasks = applyStatusOrdering(tasks, statusSort.direction);
    }

    // ========================================================================
    // STEP 5: Group by Project
    // ========================================================================
    const tasksByProject: Record<string, any[]> = {};
    tasks.forEach(task => {
        const projectId = task.projectId || 'unknown';
        if (!tasksByProject[projectId]) {
            tasksByProject[projectId] = [];
        }
        tasksByProject[projectId].push(task);
    });

    // Get total count
    const totalCount = await prisma.task.count({ where });
    const hasMore = totalCount > page * pageSize;

    return {
        tasksByProject,
        totalCount,
        hasMore,
    };
}

/**
 * Generate cache key hash from filters and sorts
 */
function getSortedFilterHash(filters: TaskFilters, sorts: SortConfig[]): string {
    return JSON.stringify({
        status: filters.status,
        projectId: filters.projectId,
        assigneeId: filters.assigneeId,
        tagId: filters.tagId,
        search: filters.search,
        dueAfter: filters.dueAfter,
        dueBefore: filters.dueBefore,
        sorts: sorts,
    });
}

/**
 * Cached version with Next.js unstable_cache
 */
const getCachedSortedSubTasks = (
    workspaceId: string,
    workspaceMemberId: string,
    userId: string,
    isAdmin: boolean,
    fullAccessProjectIds: string[],
    filters: TaskFilters,
    sorts: SortConfig[],
    page: number,
    pageSize: number
) => {
    const filterHash = getSortedFilterHash(filters, sorts);
    const roleHash = isAdmin ? 'admin' : `access-${fullAccessProjectIds.sort().join(',')}`;

    return unstable_cache(
        async () => _getSortedSubTasksInternal(
            workspaceId,
            workspaceMemberId,
            userId,
            isAdmin,
            fullAccessProjectIds,
            filters,
            sorts,
            page,
            pageSize
        ),
        [`sorted-subtasks-${workspaceId}-user-${userId}-filters-${filterHash}-role-${roleHash}-page-${page}-v1`],
        {
            tags: CacheTags.workspaceTasks(workspaceId, workspaceMemberId),
            revalidate: 30,
        }
    )();
};

/**
 * PUBLIC API: Get sorted subtasks for the sorted view
 */
export const getSortedSubTasks = cache(
    async (
        workspaceId: string,
        filters: Omit<TaskFilters, 'workspaceId'> = {},
        sorts: SortConfig[] = [],
        page: number = 1,
        pageSize: number = 50
    ) => {
        try {
            const permissions = filters.projectId
                ? await getUserPermissions(workspaceId, filters.projectId)
                : await getWorkspacePermissions(workspaceId);

            if (!permissions.workspaceMemberId) {
                return {
                    tasksByProject: {},
                    totalCount: 0,
                    hasMore: false,
                };
            }

            // Derive fullAccessProjectIds
            let fullAccessProjectIds: string[] = [];

            if ('leadProjectIds' in permissions) {
                const leads = permissions.leadProjectIds || [];
                const managers = (permissions as any).managedProjectIds || [];
                fullAccessProjectIds = [...new Set([...leads, ...managers])];
            } else if ('isProjectLead' in permissions && filters.projectId) {
                if (permissions.isProjectLead || permissions.isProjectManager) {
                    fullAccessProjectIds = [filters.projectId];
                }
            }

            return await getCachedSortedSubTasks(
                workspaceId,
                permissions.workspaceMemberId,
                permissions.workspaceMember!.userId,
                permissions.isWorkspaceAdmin,
                fullAccessProjectIds,
                { ...filters, workspaceId },
                sorts,
                page,
                pageSize
            );

        } catch (error) {
            console.error("Error fetching sorted subtasks:", error);
            return {
                tasksByProject: {},
                totalCount: 0,
                hasMore: false,
            };
        }
    }
);

export type SortedSubTasksResponse = Awaited<ReturnType<typeof getSortedSubTasks>>;
