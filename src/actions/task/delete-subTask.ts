"use server"

import { getUserPermissions } from "@/data/user/get-user-permissions";
import { invalidateTaskMutation } from "@/lib/cache/invalidation";
import { requireUser } from "@/lib/auth/require-user";
import prisma from "@/lib/db";
import { ApiResponse } from "@/lib/types";

export async function deleteSubTask(
    subTaskId: string
): Promise<ApiResponse> {
    try {
        // Authenticate user
        const user = await requireUser();

        // Get the subtask with project and workspace info
        const existingSubTask = await prisma.task.findUnique({
            where: { id: subTaskId },
            include: {
                project: {
                    select: {
                        id: true,
                        workspaceId: true,
                        slug: true,
                    }
                }
            }
        });

        if (!existingSubTask) {
            return {
                status: "error",
                message: "Subtask not found",
            };
        }

        // Check permissions
        const permissions = await getUserPermissions(
            existingSubTask.project.workspaceId,
            existingSubTask.project.id
        );

        // Permission logic:
        // - Workspace ADMIN: Can delete all subtasks
        // - PROJECT_MANAGER: Can delete all subtasks in their project
        // - LEAD: Can delete only subtasks they created
        const canDeleteAllTasks = permissions.isWorkspaceAdmin || permissions.isProjectManager;
        const canDeleteOwnTasks = permissions.isProjectLead && existingSubTask.createdById === user.id;

        if (!canDeleteAllTasks && !canDeleteOwnTasks) {
            return {
                status: "error",
                message: permissions.isProjectLead
                    ? "You can only delete subtasks you created"
                    : "You don't have permission to delete this subtask",
            };
        }

        // Delete the subtask
        await prisma.task.delete({
            where: { id: subTaskId },
        });

        // OPTIMIZED: Use comprehensive cache invalidation
        await invalidateTaskMutation({
            taskId: subTaskId,
            projectId: existingSubTask.projectId,
            workspaceId: existingSubTask.project.workspaceId,
            userId: user.id,
            parentTaskId: existingSubTask.parentTaskId || undefined
        });

        return {
            status: "success",
            message: "Subtask deleted successfully",
        };

    } catch (err) {
        console.error("Error deleting subtask:", err);
        return {
            status: "error",
            message: "We couldn't delete the subtask. Please try again.",
        }
    }
}