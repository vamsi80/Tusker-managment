"use server";

import { cache } from "react";
import prisma from "@/lib/db";
import { getUserPermissions, getWorkspacePermissions } from "@/data/user/get-user-permissions";
import { unstable_cache } from "next/cache";

export type TaskViewType = "list" | "kanban" | "gantt" | "calendar";

interface GetTasksOptions {
    workspaceId: string;
    projectId?: string;
    view?: TaskViewType;
    status?: string; // For Kanban filtering
    page?: number;
    limit?: number;
    search?: string;
    assigneeId?: string;
    tag?: string;
    startDate?: string;
    endDate?: string;
    filterParentTaskId?: string;
}

/**
 * Unified Task Data Fetching Function
 * 
 * Fetches tasks based on the current view context:
 * - List/Gantt: Fetches Parent Tasks (Hierarchical root)
 * - Kanban: Fetches Subtasks (Work items) with full context (Project, Parent)
 */
async function _getTasksInternal(
    workspaceId: string,
    workspaceMemberId: string,
    userId: string,
    isAdmin: boolean,
    leadProjectIds: string[],
    options: GetTasksOptions
) {
    const { projectId, view, status, page = 1, limit = 10, search, assigneeId } = options;
    const skip = (page - 1) * limit;

    // 1. Determine Accessible Projects
    const projects = await prisma.project.findMany({
        where: {
            workspaceId,
            ...(projectId ? { id: projectId } : {}),
            ...(isAdmin ? {} : {
                projectMembers: {
                    some: { workspaceMemberId, hasAccess: true }
                }
            })
        },
        select: { id: true }
    });
    const projectIds = projects.map(p => p.id);

    if (projectIds.length === 0) return { tasks: [], totalCount: 0, hasMore: false };

    // 2. Build Where Clause
    const where: any = {
        projectId: { in: projectIds },
        workspaceId,
    };

    // View-specific Type Filtering
    if (view === 'kanban') {
        // Kanban shows Subtasks (Actionable items)
        where.parentTaskId = { not: null };
    } else {
        // List/Gantt shows Parent Tasks (Hierarchy roots)
        where.parentTaskId = null;
    }

    // Status Filter (Kanban Column)
    if (status) where.status = status;

    // Search
    if (search) {
        where.OR = [
            { name: { contains: search, mode: 'insensitive' } },
            { taskSlug: { contains: search, mode: 'insensitive' } },
        ];
    }

    // Assignee Filter
    if (assigneeId) where.assigneeTo = assigneeId;

    // Tag Filter
    if (options.tag) where.tag = { name: options.tag };

    // Date Filters
    if (options.startDate || options.endDate) {
        if (options.startDate) where.startDate = { gte: new Date(options.startDate) };
        if (options.endDate) {
            if (!where.startDate) where.startDate = {};
            where.startDate.lte = new Date(options.endDate);
        }
    }

    // Parent Task Filter (override)
    if (options.filterParentTaskId) {
        where.parentTaskId = options.filterParentTaskId;
    }

    // Permission Logic (Hybrid)
    const fullAccessProjectIds = isAdmin ? projectIds : leadProjectIds.filter(id => projectIds.includes(id));

    if (!isAdmin && fullAccessProjectIds.length < projectIds.length) {
        // User has limited access to some projects (Member only)
        where.OR = [
            { projectId: { in: fullAccessProjectIds } }, // Full access
            { assigneeTo: userId } // Assigned to me
        ];
    }

    // 3. Build Select Clause (Unified - Always fetch rich context)
    const select: any = {
        id: true,
        name: true,
        status: true,
        taskSlug: true,
        description: true,
        startDate: true,
        dueDate: true, // Always include dueDate
        days: true,
        projectId: true,
        isPinned: true,
        pinnedAt: true,
        createdAt: true,
        updatedAt: true,
        createdById: true,
        reviewerId: true,
        assignee: {
            select: { id: true, name: true, surname: true, image: true }
        },
        reviewer: {
            select: { id: true, name: true, surname: true, image: true }
        },
        createdBy: {
            select: { id: true, name: true, surname: true, image: true }
        },
        _count: {
            select: { subTasks: true, reviewComments: true }
        },
        // Always select Relations
        parentTask: {
            select: { id: true, name: true, taskSlug: true }
        },
        project: {
            select: {
                id: true, name: true, slug: true, color: true,
                projectMembers: {
                    where: { projectRole: "PROJECT_MANAGER" },
                    take: 1,
                    select: {
                        workspaceMember: {
                            select: { user: { select: { name: true, surname: true, image: true } } }
                        }
                    }
                }
            }
        },
        tag: { select: { id: true, name: true } }
    };
    // No view-specific select logic needed - we fetch everything relevant.

    // 4. Exec Query
    const [tasks, totalCount] = await prisma.$transaction([
        prisma.task.findMany({
            where,
            select,
            orderBy: view === 'kanban'
                ? [{ isPinned: 'desc' }, { position: 'asc' }]
                : [{ projectId: 'asc' }, { position: 'asc' }],
            skip,
            take: limit
        }),
        prisma.task.count({ where })
    ]);

    return {
        tasks,
        totalCount,
        hasMore: skip + tasks.length < totalCount
    };
}

/**
 * Public API for Unified Task Fetching
 */
export const getTasks = cache(async (options: GetTasksOptions) => {
    const { workspaceId, projectId } = options;

    // Auth & Permissions
    let permissions;
    let leadProjectIds: string[] = [];
    let isWorkspaceAdmin = false;

    if (projectId) {
        permissions = await getUserPermissions(workspaceId, projectId);
        isWorkspaceAdmin = permissions.isWorkspaceAdmin;
        if (permissions.isProjectLead || permissions.isProjectManager) {
            leadProjectIds = [projectId];
        }
    } else {
        const wsPerms = await getWorkspacePermissions(workspaceId);
        permissions = wsPerms;
        isWorkspaceAdmin = wsPerms.isWorkspaceAdmin;
        leadProjectIds = [...(wsPerms.leadProjectIds || []), ...(wsPerms.managedProjectIds || [])];
    }

    if (!permissions.workspaceMemberId) return { tasks: [], totalCount: 0, hasMore: false };

    // Use Cache
    // Key depends on all options
    const cacheKey = `tasks-${workspaceId}-${projectId || 'all'}-${options.view}-${options.status || 'all'}-${permissions.workspaceMember.userId}-${options.page}-v3`;
    const tag = projectId ? `project-tasks-${projectId}` : `workspace-tasks-${workspaceId}`;

    return await unstable_cache(
        () => _getTasksInternal(
            workspaceId,
            permissions.workspaceMemberId!,
            permissions.workspaceMember!.userId,
            isWorkspaceAdmin,
            leadProjectIds,
            options
        ),
        [cacheKey],
        { tags: [tag] }
    )();
});
