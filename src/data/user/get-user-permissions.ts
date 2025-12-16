"use server";

import { cache } from "react";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/auth/require-user";

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

        const isWorkspaceAdmin = workspaceMember.workspaceRole === "ADMIN";
        const isProjectLead = projectMember?.projectRole === "LEAD";
        const isMember = workspaceMember.workspaceRole === "MEMBER" && (!projectMember || projectMember.projectRole === "MEMBER");
        const canCreateSubTask = isWorkspaceAdmin || isProjectLead;
        const canPerformBulkOperations = isWorkspaceAdmin || isProjectLead;

        return {
            isWorkspaceAdmin,
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
            isProjectLead: false,
            isMember: false,
            canCreateSubTask: false,
            canPerformBulkOperations: false,
            workspaceMemberId: null,
        };
    }
});

export type UserPermissionsType = Awaited<ReturnType<typeof getUserPermissions>>;
