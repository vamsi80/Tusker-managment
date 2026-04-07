"use server";
import { getUserPermissions } from "@/data/user/get-user-permissions";
import { invalidateTaskMutation } from "@/lib/cache/invalidation";
import { requireUser } from "@/lib/auth/require-user";
import { revalidateTag } from "next/cache";
import prisma from "@/lib/db";
import { ApiResponse } from "@/lib/types";

export async function deleteTask(
    taskId: string
): Promise<ApiResponse> {

    try {
        // Authenticate user
        const user = await requireUser();

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

        // 2. Check permissions
        const permissions = await getUserPermissions(
            existingTask.project.workspaceId,
            existingTask.project.id
        );

        // Permission logic:
        // - Workspace ADMIN: Can delete all tasks
        // - PROJECT_MANAGER: Can delete all tasks in their project
        // - LEAD: Can delete only tasks they created
        const canDeleteAllTasks = permissions.isWorkspaceAdmin || permissions.isProjectManager;
        const canDeleteOwnTasks = permissions.isProjectLead && permissions.projectMember && existingTask.createdById === permissions.projectMember.id;

        if (!canDeleteAllTasks && !canDeleteOwnTasks) {
            return {
                status: "error",
                message: permissions.isProjectLead
                    ? "You can only delete tasks you created"
                    : "You don't have permission to delete this task",
            };
        }

        // 3. Delete the task (this will cascade delete all subtasks due to onDelete: Cascade in schema)
        await prisma.task.delete({
            where: { id: taskId },
        });

        // 4. OPTIMIZED: Use comprehensive cache invalidation
        await invalidateTaskMutation({
            taskId: taskId,
            projectId: existingTask.projectId,
            workspaceId: existingTask.project.workspaceId,
            userId: user.id
        });

        // 5. MANUAL REVALIDATION: Explicitly clear the fetch tags for the whole workspace/project
        // This ensures the getTasks cache is purged immediately for everyone.
        (revalidateTag as any)(`workspace-tasks-${existingTask.project.workspaceId}`, "layout");
        if (existingTask.projectId) {
            (revalidateTag as any)(`project-tasks-${existingTask.projectId}`, "layout");
        }


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