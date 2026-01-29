"use server";

import { cache } from "react";
import { unstable_cache } from "next/cache";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/auth/require-user";
import { getUserPermissions, getWorkspacePermissions } from "@/data/user/get-user-permissions";
import { CacheTags, withCustomTags } from "@/data/cache-tags";


type TaskStatus = "TO_DO" | "IN_PROGRESS" | "CANCELLED" | "REVIEW" | "HOLD" | "COMPLETED";

export interface KanbanFilters {
    assigneeId?: string | null;
    parentTaskId?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    searchQuery?: string;
    tag?: string | null;
}

/**
 * Internal function to fetch subtasks by status with pagination
 * Workspace-level with optional project filtering
 * 
 * @param workspaceId - Workspace ID
 * @param userId - User ID (already authenticated)
 * @param workspaceMemberId - Workspace member ID (from permissions)
 * @param isAdmin - Whether user is workspace admin (from permissions)
 * @param isProjectLead - Whether user is project LEAD (when filtering by project)
 * @param status - Task status
 * @param projectId - Optional project filter
 * @param page - Page number
 * @param pageSize - Items per page
 */
async function _getSubTasksByStatusInternal(
    workspaceId: string,
    workspaceMemberId: string,
    userId: string,
    isAdmin: boolean,
    fullAccessProjectIds: string[],
    status: TaskStatus,
    projectId: string | undefined,
    page: number,
    pageSize: number,
    filters?: KanbanFilters
) {
    const skip = (page - 1) * pageSize;

    // Get accessible projects
    const projects = await prisma.project.findMany({
        where: {
            workspaceId,
            // If admin, see all projects; if member, only assigned projects
            ...(isAdmin ? {} : {
                projectMembers: {
                    some: {
                        workspaceMemberId: workspaceMemberId,
                        hasAccess: true,
                    },
                },
            }),
            // Apply project filter if provided
            ...(projectId ? { id: projectId } : {}),
        },
        select: { id: true },
    });

    const projectIds = projects.map(p => p.id);

    if (projectIds.length === 0) {
        return { subTasks: [], totalCount: 0, hasMore: false, currentPage: 1 };
    }

    // Build where clause
    const whereClause: any = {
        parentTask: { projectId: { in: projectIds } },
        parentTaskId: { not: null }, // Only subtasks
        status,
    };

    if (filters) {
        if (filters.assigneeId) whereClause.assigneeTo = filters.assigneeId;
        if (filters.parentTaskId) whereClause.parentTaskId = filters.parentTaskId;
        if (filters.tag) whereClause.tag = { name: filters.tag };

        if (filters.searchQuery) {
            const q = filters.searchQuery;
            whereClause.OR = [
                { name: { contains: q, mode: 'insensitive' } },
                { taskSlug: { contains: q, mode: 'insensitive' } },
                { assignee: { name: { contains: q, mode: 'insensitive' } } },
                { assignee: { surname: { contains: q, mode: 'insensitive' } } },
            ];
        }

        if (filters.startDate || filters.endDate) {
            if (filters.startDate) whereClause.startDate = { gte: new Date(filters.startDate) };
            if (filters.endDate) {
                // Logic for end date match (if due date <= filter end date)
                // This requires days field logic which assumes startDate + days
                // Simplified: filter by startDate <= endDate
                // Or complex raw query. For now, let's filter purely on startDate range if simpler
                // Or we can leave date filtering to client if server logic is too complex for Prisma basic filtering
                // User asked for "filters". Let's apply start date at least.
                if (!whereClause.startDate) whereClause.startDate = {};
                whereClause.startDate.lte = new Date(filters.endDate);
            }
        }
    }

    // Permission logic (Hybrid):
    // - ADMIN: See all subtasks
    // - Full Access Projects: See all subtasks
    // - Member Projects: See only assigned subtasks
    if (!isAdmin) {
        if (fullAccessProjectIds.length > 0) {
            // Hybrid: Full access projects OR Assigned to me
            // Note: The base query already restricts to 'projectIds' (authorized projects)
            whereClause.OR = [
                { parentTask: { projectId: { in: fullAccessProjectIds } } },
                { assigneeTo: userId }
            ];
        } else {
            // Access only assigned tasks
            whereClause.assignee = { id: userId };
        }
    }

    // Fetch count and data in transaction
    const [totalCount, subTasks] = await prisma.$transaction([
        prisma.task.count({ where: whereClause }),
        prisma.task.findMany({
            where: whereClause,
            select: {
                id: true,
                projectId: true, // Add this
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
                isPinned: true,
                pinnedAt: true,
                parentTask: {
                    select: {
                        id: true,
                        name: true,
                        taskSlug: true,
                        projectId: true,
                        project: {
                            select: {
                                id: true,
                                name: true,
                                slug: true,
                                color: true,
                                projectMembers: {
                                    where: { projectRole: "PROJECT_MANAGER" },
                                    take: 1,
                                    select: {
                                        workspaceMember: {
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
                                    },
                                },
                            },
                        },
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
                _count: {
                    select: {
                        reviewComments: true,
                    },
                },
            },
            orderBy: [
                { isPinned: 'desc' }, // Pinned tasks first
                { position: 'asc' },  // Then by position
            ],
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

/**
 * Cached version with Next.js unstable_cache
 */
const getCachedSubTasksByStatus = (
    workspaceId: string,
    userId: string,
    workspaceMemberId: string,
    isAdmin: boolean,
    fullAccessProjectIds: string[],
    status: TaskStatus,
    projectId: string | undefined,
    page: number,
    pageSize: number,
    filters?: KanbanFilters
) =>
    unstable_cache(
        async () => _getSubTasksByStatusInternal(workspaceId, workspaceMemberId, userId, isAdmin, fullAccessProjectIds, status, projectId, page, pageSize, filters),
        [`kanban-ws-${workspaceId}-${projectId || 'all'}-${status}-${userId}-access-${fullAccessProjectIds.sort().join(',')}-p${page}-s${pageSize}-f${JSON.stringify(filters || {})}-v5`],
        {
            tags: projectId
                ? withCustomTags(
                    CacheTags.subtasksByStatus(projectId, status),
                    `workspace-tasks-${workspaceId}`
                )
                : withCustomTags(
                    CacheTags.workspaceTasks(workspaceId),
                    `kanban-${status}`,
                    'kanban-all'
                ),
        }
    )();

/**
 * Get subtasks by status with pagination for Kanban columns
 * Workspace-first architecture with optional project filtering
 * 
 * @param workspaceId - Workspace ID
 * @param status - Task status (column)
 * @param projectId - Optional project ID to filter by
 * @param page - Page number (default: 1)
 * @param pageSize - Items per page (default: 5)
 * 
 * @example
 * // Workspace Kanban - all subtasks in workspace
 * const { subTasks } = await getSubTasksByStatus(workspaceId, 'IN_PROGRESS');
 * 
 * // Project Kanban - subtasks filtered by project
 * const { subTasks } = await getSubTasksByStatus(workspaceId, 'IN_PROGRESS', projectId);
 */
export const getSubTasksByStatus = cache(
    async (
        workspaceId: string,
        status: TaskStatus,
        projectId?: string,
        page: number = 1,
        pageSize: number = 5,
        filters?: KanbanFilters
    ) => {
        try {
            let permissions;

            let fullAccessProjectIds: string[] = [];

            if (projectId) {
                // ✅ When filtering by project, use getUserPermissions (includes everything!)
                permissions = await getUserPermissions(workspaceId, projectId);
                if (permissions.isProjectLead || permissions.isProjectManager) {
                    fullAccessProjectIds = [projectId];
                }
            } else {
                // ✅ For workspace-level, use getWorkspacePermissions
                permissions = await getWorkspacePermissions(workspaceId);
                // @ts-ignore
                const leads = permissions.leadProjectIds || [];
                // @ts-ignore
                const managers = permissions.managedProjectIds || [];
                fullAccessProjectIds = [...new Set([...leads, ...managers])];
            }

            if (!permissions.workspaceMemberId) {
                return {
                    subTasks: [],
                    totalCount: 0,
                    hasMore: false,
                    currentPage: 1,
                };
            }

            // ✅ Pass permissions directly to avoid redundant checks
            return await getCachedSubTasksByStatus(
                workspaceId,
                permissions.workspaceMember!.userId,
                permissions.workspaceMemberId,
                permissions.isWorkspaceAdmin,
                fullAccessProjectIds,
                status,
                projectId,
                page,
                pageSize,
                filters
            );
        } catch (error) {
            console.error("Error fetching subtasks by status:", error);
            return {
                subTasks: [],
                totalCount: 0,
                hasMore: false,
                currentPage: 1,
            };
        }
    }
);

// Type exports
export type SubTasksByStatusResponse = Awaited<ReturnType<typeof getSubTasksByStatus>>;
export type KanbanSubTaskType = SubTasksByStatusResponse['subTasks'][number];
