"use server";

import { requireUser } from "@/app/data/user/require-user";
import prisma from "@/lib/db";
import { ApiResponse } from "@/lib/types";
import { hasWorkspacePermission } from "@/lib/constants/workspace-access";

export async function deleteProject(projectId: string): Promise<ApiResponse> {
    const user = await requireUser();

    try {
        // 1. Get the project and verify it exists
        const project = await prisma.project.findUnique({
            where: { id: projectId },
            include: {
                workspace: {
                    include: {
                        members: true,
                    },
                },
            },
        });

        if (!project) {
            return {
                status: "error",
                message: "Project not found.",
            };
        }

        // Check if user has permission to delete projects (OWNER or ADMIN)
        const workspaceMember = project.workspace.members.find(
            (m) => m.userId === user.id
        );

        if (!workspaceMember || !hasWorkspacePermission(workspaceMember.workspaceRole, "project:delete")) {
            return {
                status: "error",
                message: "Only workspace owners and admins can delete projects.",
            };
        }

        // 3. Delete the project (cascades to tasks, project members, etc.)
        await prisma.project.delete({
            where: { id: projectId },
        });

        // 4. Invalidate project cache
        const { invalidateWorkspaceProjects, invalidateProjectTasks } = await import(
            "@/app/data/user/invalidate-project-cache"
        );
        await invalidateWorkspaceProjects(project.workspaceId);
        await invalidateProjectTasks(projectId);

        return {
            status: "success",
            message: "Project deleted successfully.",
        };
    } catch (err) {
        console.error("Error deleting project:", err);
        return {
            status: "error",
            message: "An unexpected error occurred while deleting the project. Please try again later.",
        };
    }
}
