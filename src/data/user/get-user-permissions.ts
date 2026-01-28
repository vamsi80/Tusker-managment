"use server";

import { cache } from "react";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/auth/require-user";

/**
 * Get workspace-level permissions for the current user
 * Use this for workspace-level queries (no specific project)
 */
export const getWorkspacePermissions = cache(async (workspaceId: string) => {
    const user = await requireUser();

    try {
        // Get workspace member
        const workspaceMember = await prisma.workspaceMember.findFirst({
            where: {
                workspaceId: workspaceId,
                userId: user.id,
            },
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

        // Check if user is a project lead in any project
        const leadingProjects = await prisma.projectMember.findMany({
            where: {
                workspaceMemberId: workspaceMember.id,
                projectRole: "LEAD",
                project: {
                    workspaceId: workspaceId,
                },
            },
            select: { projectId: true }
        });

        const isProjectLead = leadingProjects.length > 0;
        const hasAccess = isWorkspaceAdmin || isProjectLead;
        const leadProjectIds = leadingProjects.map(p => p.projectId);

        return {
            isWorkspaceAdmin,
            canCreateProject,
            isProjectLead,
            hasAccess,
            leadProjectIds,
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
});

/**
 * Get project-level permissions for the current user
 * Use this for project-specific queries
 */
export const getUserPermissions = cache(async (workspaceId: string, projectId: string) => {
    const user = await requireUser();

    try {
        // Get workspace member
        const workspaceMember = await prisma.workspaceMember.findFirst({
            where: {
                workspaceId: workspaceId,
                userId: user.id,
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

        // Get project member
        const projectMember = await prisma.projectMember.findFirst({
            where: {
                projectId: projectId,
                workspaceMemberId: workspaceMember.id,
            },
        });

        const isWorkspaceAdmin = workspaceMember.workspaceRole === "OWNER" || workspaceMember.workspaceRole === "ADMIN";
        const isProjectManager = projectMember?.projectRole === "PROJECT_MANAGER";
        const isProjectLead = projectMember?.projectRole === "LEAD";
        const isMember = workspaceMember.workspaceRole === "MEMBER" && (!projectMember || projectMember.projectRole === "MEMBER");
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
});

export type WorkspacePermissionsType = Awaited<ReturnType<typeof getWorkspacePermissions>>;
export type UserPermissionsType = Awaited<ReturnType<typeof getUserPermissions>>;
