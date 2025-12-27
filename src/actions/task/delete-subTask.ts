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

        // Check permissions - only workspace admin or project lead can delete subtasks
        const permissions = await getUserPermissions(
            existingSubTask.project.workspaceId,
            existingSubTask.project.id
        );

        if (!permissions.isWorkspaceAdmin && !permissions.isProjectLead) {
            return {
                status: "error",
                message: "You don't have permission to delete this subtask",
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