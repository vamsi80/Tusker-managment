"use server";

import { cache } from "react";
import { unstable_cache } from "next/cache";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/auth/require-user";
import { CacheTags } from "@/data/cache-tags";

/**
 * Get workspace-level permissions for the current user
 * Use this for workspace-level queries (no specific project)
 */
/**
 * Internal function to fetch workspace permissions
 */
async function _fetchWorkspacePermissionsInternal(workspaceId: string, userId: string) {
    try {
        const workspaceMember = await prisma.workspaceMember.findFirst({
            where: {
                workspaceId: workspaceId,
                userId: userId,
            },
            include: {
                projectMembers: {
                    where: {
                        projectRole: {
                            in: ["LEAD", "PROJECT_MANAGER"]
                        },
                        project: {
                            workspaceId: workspaceId,
                        },
                    },
                    select: {
                        projectId: true,
                        projectRole: true
                    }
                }
            }
        });

        if (!workspaceMember) {
            return {
                isWorkspaceAdmin: false,
                canCreateProject: false,
                isProjectLead: false,
                hasAccess: false,
                workspaceMemberId: null,
                workspaceMember: null,
            };
        }

        const isWorkspaceAdmin = workspaceMember.workspaceRole === "OWNER" || workspaceMember.workspaceRole === "ADMIN";
        const canCreateProject = isWorkspaceAdmin || workspaceMember.workspaceRole === "MANAGER";
        const projectRoles = workspaceMember.projectMembers || [];
        const isProjectLead = projectRoles.some(p => p.projectRole === "LEAD");
        const isProjectManager = projectRoles.some(p => p.projectRole === "PROJECT_MANAGER");
        const hasAccess = isWorkspaceAdmin || isProjectLead || isProjectManager;
        const leadProjectIds = projectRoles.filter(p => p.projectRole === "LEAD").map(p => p.projectId);
        const managedProjectIds = projectRoles.filter(p => p.projectRole === "PROJECT_MANAGER").map(p => p.projectId);

        return {
            isWorkspaceAdmin,
            canCreateProject,
            isProjectLead,
            isProjectManager,
            hasAccess,
            leadProjectIds,
            managedProjectIds,
            workspaceMemberId: workspaceMember.id,
            workspaceMember,
        };
    } catch (error) {
        console.error("Error fetching workspace permissions:", error);
        return {
            isWorkspaceAdmin: false,
            canCreateProject: false,
            isProjectLead: false,
            hasAccess: false,
            leadProjectIds: [],
            workspaceMemberId: null,
            workspaceMember: null,
        };
    }
}

/**
 * Get workspace-level permissions for the current user
 */
export const getWorkspacePermissions = cache(async (workspaceId: string) => {
    const user = await requireUser();

    // Cache permissions for 5 minutes - they don't change frequently
    const fetchPerms = unstable_cache(
        async () => _fetchWorkspacePermissionsInternal(workspaceId, user.id),
        [`workspace-perms-${workspaceId}-${user.id}`],
        {
            tags: CacheTags.userPermissions(user.id, workspaceId),
            revalidate: 300, // 5 minutes
        }
    );

    return fetchPerms();
});

/**
 * Get project-level permissions for the current user
 * Use this for project-specific queries
 */
/**
 * Internal function to fetch project permissions
 */
async function _getUserPermissionsInternal(workspaceId: string, projectId: string, userId: string) {
    try {
        const workspaceMember = await prisma.workspaceMember.findFirst({
            where: {
                workspaceId: workspaceId,
                userId: userId,
            },
        });

        if (!workspaceMember) {
            return {
                isWorkspaceAdmin: false,
                isProjectLead: false,
                isMember: false,
                canCreateSubTask: false,
                canPerformBulkOperations: false,
                workspaceMemberId: null,
            };
        }

        const projectMember = await prisma.projectMember.findFirst({
            where: {
                projectId: projectId,
                workspaceMemberId: workspaceMember.id,
            },
        });

        const isWorkspaceAdmin = workspaceMember.workspaceRole === "OWNER" || workspaceMember.workspaceRole === "ADMIN";
        const isProjectManager = projectMember?.projectRole === "PROJECT_MANAGER";
        const isProjectLead = projectMember?.projectRole === "LEAD";
        const isMember = !isWorkspaceAdmin && !isProjectManager && !isProjectLead;
        const canCreateSubTask = isWorkspaceAdmin || isProjectManager || isProjectLead;
        const canPerformBulkOperations = isWorkspaceAdmin || isProjectManager || isProjectLead;

        return {
            isWorkspaceAdmin,
            isProjectManager,
            isProjectLead,
            isMember,
            canCreateSubTask,
            canPerformBulkOperations,
            workspaceMemberId: workspaceMember.id,
            workspaceMember,
            projectMember,
        };
    } catch (error) {
        console.error("Error fetching user permissions:", error);
        return {
            isWorkspaceAdmin: false,
            isProjectManager: false,
            isProjectLead: false,
            isMember: false,
            canCreateSubTask: false,
            canPerformBulkOperations: false,
            workspaceMemberId: null,
        };
    }
}

/**
 * Get project-level permissions for the current user
 */
export const getUserPermissions = cache(async (workspaceId: string, projectId: string) => {
    const user = await requireUser();

    // Cache for 5 minutes
    const fetchPerms = unstable_cache(
        async () => _getUserPermissionsInternal(workspaceId, projectId, user.id),
        [`project-perms-${projectId}-${user.id}`],
        {
            tags: CacheTags.userPermissions(user.id, workspaceId),
            revalidate: 300, // 5 minutes
        }
    );

    return fetchPerms();
});

export type WorkspacePermissionsType = Awaited<ReturnType<typeof getWorkspacePermissions>>;
export type UserPermissionsType = Awaited<ReturnType<typeof getUserPermissions>>;
