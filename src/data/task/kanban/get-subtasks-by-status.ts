"use server";

import { cache } from "react";
import prisma from "@/lib/db";
import { unstable_cache } from "next/cache";
import { getWorkspacePermissions, getProjectLevelPermissions } from "@/data/user/get-user-permissions";

type TaskStatus = "TO_DO" | "IN_PROGRESS" | "BLOCKED" | "REVIEW" | "HOLD" | "COMPLETED";

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
    isAdmin: boolean,
    isProjectLead: boolean,
    status: TaskStatus,
    projectId: string | undefined,
    page: number,
    pageSize: number
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

    // Permission logic:
    // - ADMIN/OWNER: See all subtasks
    // - Project LEAD (when filtering by that project): See all subtasks in that project
    // - MEMBER: See only assigned subtasks
    if (!isAdmin && !isProjectLead) {
        whereClause.assignee = { workspaceMemberId: workspaceMemberId };
    }

    // Fetch count and data in transaction
    const [totalCount, subTasks] = await prisma.$transaction([
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
                tag: true,
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
    isProjectLead: boolean,
    status: TaskStatus,
    projectId: string | undefined,
    page: number,
    pageSize: number
) =>
    unstable_cache(
        async () => _getSubTasksByStatusInternal(workspaceId, workspaceMemberId, isAdmin, isProjectLead, status, projectId, page, pageSize),
        [`kanban-ws-${workspaceId}-${projectId || 'all'}-${status}-${userId}-lead${isProjectLead}-p${page}-s${pageSize}`],
        {
            tags: [
                `workspace-tasks-${workspaceId}`,
                ...(projectId ? [`project-tasks-${projectId}`] : []),
                `kanban-${status}`,
                `kanban-all`
            ],
            revalidate: 30,
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
        pageSize: number = 5
    ) => {
        try {
            // ✅ Get workspace permissions (this calls requireUser internally - only ONCE!)
            const permissions = await getWorkspacePermissions(workspaceId);

            if (!permissions.workspaceMemberId) {
                return {
                    subTasks: [],
                    totalCount: 0,
                    hasMore: false,
                    currentPage: 1,
                };
            }

            // ✅ Check if user is LEAD of the specific project (when filtering by project)
            let isProjectLead = false;
            if (projectId && !permissions.isWorkspaceAdmin) {
                const projectPermissions = await getProjectLevelPermissions(workspaceId, projectId);
                isProjectLead = projectPermissions.isProjectLead;
            }

            // ✅ Pass permissions directly to avoid redundant checks
            return await getCachedSubTasksByStatus(
                workspaceId,
                permissions.workspaceMemberId,
                permissions.workspaceMemberId,
                permissions.isWorkspaceAdmin,
                isProjectLead,
                status,
                projectId,
                page,
                pageSize
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
