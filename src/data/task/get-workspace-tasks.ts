"use server";

import { cache } from "react";
import prisma from "@/lib/db";
import { unstable_cache } from "next/cache";
import { TaskStatus } from "@/generated/prisma";
import { getWorkspacePermissions, getUserPermissions } from "@/data/user/get-user-permissions";
import { CacheTags } from "@/data/cache-tags";

/**
 * Filters for workspace tasks
 */
export interface WorkspaceTaskFilters {
    status?: TaskStatus;
    projectId?: string;
    assigneeId?: string;
    startDate?: Date;
    endDate?: Date;
    tag?: string; // Tag ID (tags are now dynamic)
}

/**
 * Internal function to fetch workspace tasks with filtering and pagination
 * 
 * Key Differences from get-workspace-all-tasks:
 * 1. Does NOT fetch subtasks (lazy-loaded separately)
 * 2. Supports comprehensive filtering
 * 3. Supports pagination
 * 4. Optimized for performance with large datasets
 */
async function _getWorkspaceTasksInternal(
    workspaceId: string,
    workspaceMemberId: string,
    isAdmin: boolean,
    isProjectLead: boolean,
    filters: WorkspaceTaskFilters = {},
    page: number = 1,
    pageSize: number = 10
) {
    // Get all accessible projects in the workspace
    const projects = await prisma.project.findMany({
        where: {
            workspaceId,
            // If admin/owner, see all projects; if member, only see projects they belong to
            // If project LEAD and filtering by that project, include it
            ...(isAdmin ? {} : {
                projectMembers: {
                    some: {
                        workspaceMemberId: workspaceMemberId,
                        hasAccess: true,
                    },
                },
            }),
            // Apply project filter if specified
            ...(filters.projectId ? { id: filters.projectId } : {}),
        },
        select: {
            id: true,
        },
    });

    const projectIds = projects.map(p => p.id);

    if (projectIds.length === 0) {
        return { tasks: [], totalCount: 0, hasMore: false };
    }

    // Build where clause with filters
    const whereClause: any = {
        projectId: { in: projectIds },
        parentTaskId: null, // Only parent tasks (subtasks lazy-loaded)
    };

    // Apply status filter
    if (filters.status) {
        whereClause.status = filters.status;
    }

    // Apply assignee filter
    if (filters.assigneeId) {
        whereClause.assignee = {
            id: filters.assigneeId,
        };
    }

    // Apply date range filters
    if (filters.startDate || filters.endDate) {
        whereClause.startDate = {};
        if (filters.startDate) {
            whereClause.startDate.gte = filters.startDate;
        }
        if (filters.endDate) {
            whereClause.startDate.lte = filters.endDate;
        }
    }

    // Apply tag filter
    if (filters.tag) {
        whereClause.tag = filters.tag;
    }

    // Fetch tasks with count in a single transaction
    const [totalCount, tasks] = await prisma.$transaction([
        prisma.task.count({ where: whereClause }),
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
                projectId: true,
                isPinned: true,
                pinnedAt: true,
                createdAt: true,
                updatedAt: true,
                project: {
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                        workspaceId: true,
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
                // Count subtasks but don't fetch them (lazy-loaded)
                _count: {
                    select: {
                        subTasks: true,
                    },
                },
            },
            orderBy: [
                { isPinned: 'desc' },
                { position: 'asc' },
                { createdAt: 'desc' },
            ],
            skip: (page - 1) * pageSize,
            take: pageSize,
        }),
    ]);

    const hasMore = totalCount > page * pageSize;

    return { tasks, totalCount, hasMore };
}

/**
 * Generate cache key hash from filters
 */
function getFilterHash(filters: WorkspaceTaskFilters): string {
    const parts: string[] = [];

    if (filters.status) parts.push(`s:${filters.status}`);
    if (filters.projectId) parts.push(`p:${filters.projectId}`);
    if (filters.assigneeId) parts.push(`a:${filters.assigneeId}`);
    if (filters.tag) parts.push(`t:${filters.tag}`);
    if (filters.startDate) parts.push(`sd:${filters.startDate.toISOString()}`);
    if (filters.endDate) parts.push(`ed:${filters.endDate.toISOString()}`);

    return parts.length > 0 ? parts.join('|') : 'all';
}

/**
 * Cached version with filter and pagination support
 */
const getCachedWorkspaceTasks = (
    workspaceId: string,
    userId: string,
    workspaceMemberId: string,
    isAdmin: boolean,
    isProjectLead: boolean,
    filters: WorkspaceTaskFilters,
    page: number,
    pageSize: number
) => {
    const filterHash = getFilterHash(filters);

    return unstable_cache(
        async () => _getWorkspaceTasksInternal(workspaceId, workspaceMemberId, isAdmin, isProjectLead, filters, page, pageSize),
        [`workspace-tasks-${workspaceId}-user-${userId}-filters-${filterHash}-lead${isProjectLead}-page-${page}-size-${pageSize}`],
        {
            tags: CacheTags.workspaceTasks(workspaceId, userId),
            revalidate: 60,
        }
    )();
};

/**
 * Get workspace tasks with optional filtering and pagination
 * 
 * This is the SINGLE source of truth for workspace-level task data.
 * All views (List, Kanban, Gantt) should use this function.
 * 
 * Key Features:
 * - Permission-aware (admins see all, members see only their projects)
 * - Supports comprehensive filtering
 * - Supports pagination (default: page 1, 10 items per page)
 * - Does NOT fetch subtasks (lazy-loaded on demand)
 * - Properly cached with filter-specific keys
 * 
 * @param workspaceId - The workspace ID
 * @param filters - Optional filters for status, project, assignee, dates, tags
 * @param page - Page number (default: 1)
 * @param pageSize - Items per page (default: 10)
 * @returns Tasks matching the filters with total count and hasMore flag
 */
export const getWorkspaceTasks = cache(
    async (
        workspaceId: string,
        filters: WorkspaceTaskFilters = {},
        page: number = 1,
        pageSize: number = 10
    ) => {
        try {
            let permissions;
            let isProjectLead = false;

            if (filters.projectId) {
                // ✅ When filtering by project, use getUserPermissions (includes everything!)
                permissions = await getUserPermissions(workspaceId, filters.projectId);
                isProjectLead = permissions.isProjectLead;
            } else {
                // ✅ For workspace-level, use getWorkspacePermissions
                permissions = await getWorkspacePermissions(workspaceId);
            }

            if (!permissions.workspaceMemberId) {
                return { tasks: [], totalCount: 0, hasMore: false };
            }

            // ✅ Pass permissions directly to avoid redundant checks
            const result = await getCachedWorkspaceTasks(
                workspaceId,
                permissions.workspaceMemberId, // Use as userId for cache key
                permissions.workspaceMemberId,
                permissions.isWorkspaceAdmin,
                isProjectLead,
                filters,
                page,
                pageSize
            );

            return result;
        } catch (error) {
            console.error("Error fetching workspace tasks:", error);
            return { tasks: [], totalCount: 0, hasMore: false };
        }
    }
);

/**
 * Type exports
 */
export type WorkspaceTasksResponse = Awaited<ReturnType<typeof getWorkspaceTasks>>;
export type WorkspaceTaskType = WorkspaceTasksResponse['tasks'];
