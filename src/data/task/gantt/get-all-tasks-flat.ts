"use server";

import { cache } from "react";
import prisma from "@/lib/db";
import { unstable_cache } from "next/cache";
import { getUserPermissions, getWorkspacePermissions } from "@/data/user/get-user-permissions";

// ============================================
// INTERNAL FUNCTIONS (Actual DB queries)
// ============================================

/**
 * Internal function to fetch all tasks (parent + subtasks) as a flat list
 * with role-based filtering and pagination support
 * Works for both workspace-level and project-level queries
 */
async function _getAllTasksFlatInternal(
    workspaceId: string,
    workspaceMemberId: string,
    userId: string,
    isWorkspaceAdmin: boolean,
    leadProjectIds: string[], // Projects where user is a lead/manager
    projectId?: string,
    page: number = 1,
    limit: number = 10
) {
    // Get accessible projects
    const projects = await prisma.project.findMany({
        where: {
            workspaceId,
            // If projectId is provided, filter to that project
            ...(projectId ? { id: projectId } : {}),
            // If workspace admin, see all projects; if member, only assigned projects
            ...(isWorkspaceAdmin ? {} : {
                projectMembers: {
                    some: {
                        workspaceMemberId: workspaceMemberId,
                        hasAccess: true,
                    },
                },
            }),
        },
        select: { id: true },
    });

    const projectIds = projects.map(p => p.id);

    if (projectIds.length === 0) {
        return { tasks: [] };
    }

    // Determine which projects the user has full access to
    const fullAccessProjectIds = isWorkspaceAdmin
        ? projectIds // Workspace admins see all tasks in all projects
        : leadProjectIds.filter(id => projectIds.includes(id)); // Project leads see all tasks in their projects

    // Determine which projects require assignment-based filtering
    const assignmentFilteredProjectIds = projectIds.filter(
        id => !fullAccessProjectIds.includes(id)
    );

    // Build the where clause based on user role and project access
    let whereClause;

    if (fullAccessProjectIds.length > 0 && assignmentFilteredProjectIds.length === 0) {
        // User has full access to all accessible projects
        whereClause = {
            projectId: { in: fullAccessProjectIds },
        };
    } else if (fullAccessProjectIds.length === 0 && assignmentFilteredProjectIds.length > 0) {
        // User only has assignment-based access
        whereClause = {
            projectId: { in: assignmentFilteredProjectIds },
            OR: [
                // Parent tasks where user has assigned subtasks
                {
                    parentTaskId: null,
                    subTasks: {
                        some: {
                            assignee: {
                                id: userId,
                            },
                        },
                    },
                },
                // Subtasks assigned to the user
                {
                    parentTaskId: { not: null },
                    assignee: {
                        id: userId,
                    },
                },
            ],
        };
    } else {
        // User has mixed access - full access to some projects, assignment-based for others
        whereClause = {
            OR: [
                // Full access projects - see all tasks
                {
                    projectId: { in: fullAccessProjectIds },
                },
                // Assignment-filtered projects - see only assigned tasks
                {
                    projectId: { in: assignmentFilteredProjectIds },
                    OR: [
                        // Parent tasks where user has assigned subtasks
                        {
                            parentTaskId: null,
                            subTasks: {
                                some: {
                                    assignee: {
                                        id: userId,
                                    },
                                },
                            },
                        },
                        // Subtasks assigned to the user
                        {
                            parentTaskId: { not: null },
                            assignee: {
                                id: userId,
                            },
                        },
                    ],
                },
            ],
        };
    }

    // Fetch all tasks (parent + subtasks) as a flat list with pagination
    // Only paginate parent tasks (parentTaskId: null)
    const skip = (page - 1) * limit;

    // OPTIMIZATION: Use $transaction to combine findMany and count into a single round-trip
    // This reduces DB latency, especially important for Supabase Free tier with cold starts
    const [tasks, totalCount] = await prisma.$transaction([
        prisma.task.findMany({
            where: {
                ...whereClause,
                parentTaskId: null, // Only fetch parent tasks for pagination
            },
            select: {
                id: true,
                name: true,
                taskSlug: true,
                description: true,
                status: true,
                tag: true,
                startDate: true,
                dueDate: true,
                days: true,
                parentTaskId: true,
                projectId: true,
                position: true,
                project: {
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                    },
                },
                assignee: { // Flattened assignee select structure (already was this way)
                    select: {
                        id: true,
                        name: true,
                        surname: true,
                        image: true,
                    },
                },
                _count: {
                    select: {
                        subTasks: true,
                    },
                },
            },
            orderBy: [
                { projectId: 'asc' },
                { position: 'asc' },
            ],
            skip,
            take: limit,
        }),
        prisma.task.count({
            where: {
                ...whereClause,
                parentTaskId: null,
            },
        }),
    ]);


    const hasMore = skip + tasks.length < totalCount;

    return { tasks, hasMore, totalCount };
}

// ============================================
// CACHED VERSION (Next.js unstable_cache)
// ============================================

/**
 * Cached version of getAllTasksFlat with role-based filtering and pagination
 */
const getCachedAllTasksFlat = (
    workspaceId: string,
    workspaceMemberId: string,
    userId: string,
    isWorkspaceAdmin: boolean,
    leadProjectIds: string[],
    projectId?: string,
    page: number = 1,
    limit: number = 10
) => {
    const leadsKey = (leadProjectIds || []).sort().join(',') || 'none';
    return unstable_cache(
        async () => _getAllTasksFlatInternal(workspaceId, workspaceMemberId, userId, isWorkspaceAdmin, leadProjectIds, projectId, page, limit),
        [
            projectId
                ? `project-all-tasks-flat-${projectId}-member-${workspaceMemberId}-user-${userId}-admin-${isWorkspaceAdmin}-leads-${leadsKey}-page-${page}-limit-${limit}`
                : `workspace-all-tasks-flat-${workspaceId}-member-${workspaceMemberId}-user-${userId}-admin-${isWorkspaceAdmin}-leads-${leadsKey}-page-${page}-limit-${limit}`
        ],
        {
            tags: projectId
                ? [`project-tasks-${projectId}`, `project-gantt-${projectId}`]
                : [`workspace-tasks-${workspaceId}`, `workspace-gantt-${workspaceId}`],
            revalidate: 30,
        }
    )();
};

// ============================================
// PUBLIC API
// ============================================

/**
 * Get all tasks (parent tasks only) as a paginated list with role-based filtering
 * 
 * Works for both workspace-level and project-level queries:
 * - If projectId is provided: Returns tasks from that specific project
 * - If projectId is omitted: Returns tasks from all accessible projects in the workspace
 * 
 * Returns only parent tasks (subtasks are loaded on-demand via separate API).
 * 
 * Filtering Rules:
 * - ADMIN/OWNER/LEAD: See all tasks
 * - MEMBER: Only see tasks where they have assigned subtasks
 * 
 * @param workspaceId - The workspace ID
 * @param projectId - Optional project ID. If provided, filters to that project only
 * @param page - Page number (default: 1)
 * @param limit - Number of tasks per page (default: 10)
 * @returns Object containing tasks array, hasMore flag, and totalCount
 * 
 * @example
 * // Workspace-level (all projects), first page
 * const { tasks, hasMore } = await getAllTasksFlat(workspaceId, undefined, 1, 10);
 * 
 * // Project-level (specific project), second page
 * const { tasks, hasMore } = await getAllTasksFlat(workspaceId, projectId, 2, 10);
 */
export const getAllTasksFlat = cache(
    async (workspaceId: string, projectId?: string, page: number = 1, limit: number = 10) => {

        try {
            let permissions;
            let leadProjectIds: string[] = [];
            let isWorkspaceAdmin = false;

            if (projectId) {
                // Project-level: Use getUserPermissions (includes project-specific permissions)
                permissions = await getUserPermissions(workspaceId, projectId);
                isWorkspaceAdmin = permissions.isWorkspaceAdmin;

                // For project-level queries, if user is lead/manager of THIS project, add it to leadProjectIds
                if (permissions.isProjectLead || permissions.isProjectManager) {
                    leadProjectIds = [projectId];
                }
            } else {
                // Workspace-level: Use getWorkspacePermissions
                const workspacePerms = await getWorkspacePermissions(workspaceId);
                permissions = workspacePerms;
                isWorkspaceAdmin = workspacePerms.isWorkspaceAdmin;

                // Combine lead and managed project IDs
                leadProjectIds = [
                    ...(workspacePerms.leadProjectIds || []),
                    ...(workspacePerms.managedProjectIds || [])
                ];
            }

            if (!permissions.workspaceMemberId) {
                throw new Error("User does not have access to this workspace");
            }

            return await getCachedAllTasksFlat(
                workspaceId,
                permissions.workspaceMemberId,
                permissions.workspaceMember.userId,
                isWorkspaceAdmin,
                leadProjectIds,
                projectId,
                page,
                limit
            );
        } catch (error) {
            console.error("Error fetching flat tasks:", error);
            return {
                tasks: [],
                hasMore: false,
                totalCount: 0,
            };
        }
    }
);

// ============================================
// TYPE EXPORTS
// ============================================

export type AllTasksFlatResponse = Awaited<ReturnType<typeof getAllTasksFlat>>;
export type FlatTaskType = AllTasksFlatResponse['tasks'][number];
