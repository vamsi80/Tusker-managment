"use server"

import { getUserPermissions } from "@/data/user/get-user-permissions";
import { invalidateTaskSubTasks, invalidateProjectTasks, invalidateWorkspaceTasks } from "@/lib/cache/invalidation";
import prisma from "@/lib/db";
import { ApiResponse } from "@/lib/types";
import { revalidatePath } from "next/cache";

export async function deleteSubTask(
    subTaskId: string
): Promise<ApiResponse> {
    try {
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

        // Revalidate cache (path + subtask cache + workspace cache)
        revalidatePath(`/w/${existingSubTask.project.workspaceId}/p/${existingSubTask.project.slug}/task`);
        if (existingSubTask.parentTaskId) {
            await invalidateTaskSubTasks(existingSubTask.parentTaskId);
        }
        await invalidateProjectTasks(existingSubTask.projectId);
        await invalidateWorkspaceTasks(existingSubTask.project.workspaceId);

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