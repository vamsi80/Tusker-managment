import { getUserPermissions } from "@/app/data/user/get-user-permissions";
import { invalidateProjectTasks } from "@/app/data/user/invalidate-project-cache";
import prisma from "@/lib/db";
import { ApiResponse } from "@/lib/types";
import { revalidatePath } from "next/cache";

export async function deleteTask(
    taskId: string
): Promise<ApiResponse> {

    try {
        // 1. Get the task with project and workspace info
        const existingTask = await prisma.task.findUnique({
            where: { id: taskId },
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

        if (!existingTask) {
            return {
                status: "error",
                message: "Task not found",
            };
        }

        // 2. Check permissions - only workspace admin or project lead can delete tasks
        const permissions = await getUserPermissions(
            existingTask.project.workspaceId,
            existingTask.project.id
        );

        if (!permissions.isWorkspaceAdmin && !permissions.isProjectLead) {
            return {
                status: "error",
                message: "You don't have permission to delete this task",
            };
        }

        // 3. Delete the task (this will cascade delete all subtasks due to onDelete: Cascade in schema)
        await prisma.task.delete({
            where: { id: taskId },
        });

        // 4. Revalidate cache (path + task cache)
        revalidatePath(`/w/${existingTask.project.workspaceId}/p/${existingTask.project.slug}/task`);
        await invalidateProjectTasks(existingTask.projectId);

        return {
            status: "success",
            message: "Task deleted successfully",
        };

    } catch (err) {
        console.error("Error deleting task:", err);
        return {
            status: "error",
            message: "We couldn't delete the task. Please try again.",
        }
    }
}