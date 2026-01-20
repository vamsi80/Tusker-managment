"use server";

import { cache } from "react";
import { unstable_cache } from "next/cache";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/auth/require-user";
import { getUserPermissions, getWorkspacePermissions } from "@/data/user/get-user-permissions";

// ============================================
// INTERNAL FUNCTIONS (Actual DB queries)
// ============================================

/**
 * Internal function to fetch all tasks (parent + subtasks) as a flat list
 * with role-based filtering
 * Works for both workspace-level and project-level queries
 */
async function _getAllTasksFlatInternal(
    workspaceId: string,
    workspaceMemberId: string,
    userId: string,
    isAdmin: boolean,
    projectId?: string
) {
    // Get accessible projects
    const projects = await prisma.project.findMany({
        where: {
            workspaceId,
            // If projectId is provided, filter to that project
            ...(projectId ? { id: projectId } : {}),
            // If admin, see all projects; if member, only assigned projects
            ...(isAdmin ? {} : {
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

    // Build the where clause based on user role
    const whereClause = isAdmin
        ? {
            projectId: { in: projectIds },
        }
        : {
            projectId: { in: projectIds },
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

    // Fetch all tasks (parent + subtasks) as a flat list
    const tasks = await prisma.task.findMany({
        where: whereClause,
        select: {
            id: true,
            name: true,
            taskSlug: true,
            description: true,
            status: true,
            tag: true,
            startDate: true,
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
    });

    return { tasks };
}

// ============================================
// CACHED VERSION (Next.js unstable_cache)
// ============================================

/**
 * Cached version of getAllTasksFlat with role-based filtering
 */
const getCachedAllTasksFlat = (
    workspaceId: string,
    workspaceMemberId: string,
    userId: string,
    isAdmin: boolean,
    projectId?: string
) =>
    unstable_cache(
        async () => _getAllTasksFlatInternal(workspaceId, workspaceMemberId, userId, isAdmin, projectId),
        [
            projectId
                ? `project-all-tasks-flat-${projectId}-member-${workspaceMemberId}-user-${userId}-admin-${isAdmin}`
                : `workspace-all-tasks-flat-${workspaceId}-member-${workspaceMemberId}-user-${userId}-admin-${isAdmin}`
        ],
        {
            tags: projectId
                ? [`project-tasks-${projectId}`, `project-gantt-${projectId}`]
                : [`workspace-tasks-${workspaceId}`, `workspace-gantt-${workspaceId}`],
            revalidate: 30,
        }
    )();

// ============================================
// PUBLIC API
// ============================================

/**
 * Get all tasks (parent tasks and subtasks) as a flat list with role-based filtering
 * 
 * Works for both workspace-level and project-level queries:
 * - If projectId is provided: Returns tasks from that specific project
 * - If projectId is omitted: Returns tasks from all accessible projects in the workspace
 * 
 * Returns a flat array containing both parent tasks and subtasks.
 * Parent tasks have `parentTaskId: null`, subtasks have a `parentTaskId` value.
 * 
 * Filtering Rules:
 * - ADMIN/OWNER/LEAD: See all tasks and subtasks
 * - MEMBER: Only see parent tasks that have at least one subtask assigned to them
 *           and only see their assigned subtasks
 * 
 * @param workspaceId - The workspace ID
 * @param projectId - Optional project ID. If provided, filters to that project only
 * @returns Object containing flat array of all tasks and subtasks
 * 
 * @example
 * // Workspace-level (all projects)
 * const { tasks } = await getAllTasksFlat(workspaceId);
 * 
 * // Project-level (specific project)
 * const { tasks } = await getAllTasksFlat(workspaceId, projectId);
 */
export const getAllTasksFlat = cache(
    async (workspaceId: string, projectId?: string) => {

        try {
            let permissions;

            if (projectId) {
                // Project-level: Use getUserPermissions (includes project-specific permissions)
                permissions = await getUserPermissions(workspaceId, projectId);
            } else {
                // Workspace-level: Use getWorkspacePermissions
                permissions = await getWorkspacePermissions(workspaceId);
            }

            if (!permissions.workspaceMemberId) {
                throw new Error("User does not have access to this workspace");
            }

            // Determine if user has admin-level access
            const isAdmin = permissions.isWorkspaceAdmin ||
                (projectId && 'isProjectLead' in permissions ? (permissions as any).isProjectLead as boolean : false);

            return await getCachedAllTasksFlat(
                workspaceId,
                permissions.workspaceMemberId,
                permissions.workspaceMember.userId,
                isAdmin,
                projectId
            );
        } catch (error) {
            console.error("Error fetching flat tasks:", error);
            return {
                tasks: [],
            };
        }
    }
);

// ============================================
// TYPE EXPORTS
// ============================================

export type AllTasksFlatResponse = Awaited<ReturnType<typeof getAllTasksFlat>>;
export type FlatTaskType = AllTasksFlatResponse['tasks'][number];
