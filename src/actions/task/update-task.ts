"use server";
import { getUserPermissions } from "@/data/user/get-user-permissions";
import { invalidateTaskMutation } from "@/lib/cache/invalidation";
import { requireUser } from "@/lib/auth/require-user";
import prisma from "@/lib/db";
import { ApiResponse } from "@/lib/types";
import { TaskSchemaType, taskSchema } from "@/lib/zodSchemas";
import { syncTaskToProcurement } from "@/lib/procurement/logic";

export async function editTask(
    data: TaskSchemaType,
    taskId: string
): Promise<ApiResponse> {

    try {
        // Authenticate user
        const user = await requireUser();

        // Validate the input data
        const validation = taskSchema.safeParse(data);
        if (!validation.success) {
            return {
                status: "error",
                message: "Invalid validation form data"
            }
        }

        // Get the existing task to find the project
        const existingTask = await prisma.task.findUnique({
            where: { id: taskId },
            include: {
                project: {
                    select: {
                        workspaceId: true,
                        slug: true,
                        id: true
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

        // Verify the task belongs to the correct project
        if (existingTask.projectId !== validation.data.projectId) {
            return {
                status: "error",
                message: "Task does not belong to this project",
            };
        }

        // Verify user is a member of the workspace and get permissions using cached function
        const permissions = await getUserPermissions(existingTask.project.workspaceId, existingTask.project.id);

        if (!permissions.workspaceMember) {
            return {
                status: "error",
                message: "You are not a member of this workspace",
            };
        }

        // Permission logic:
        // - Workspace ADMIN: Can edit all tasks
        // - PROJECT_MANAGER: Can edit all tasks in their project
        // - LEAD: Can edit only tasks they created
        const canEditAllTasks = permissions.isWorkspaceAdmin || permissions.isProjectManager;
        const canEditOwnTasks = permissions.isProjectLead && existingTask.createdById === user.id;

        if (!canEditAllTasks && !canEditOwnTasks) {
            return {
                status: "error",
                message: permissions.isProjectLead
                    ? "You can only edit tasks you created"
                    : "You don't have permission to edit this task",
            };
        }

        // Check if taskSlug is being changed and if it's unique
        if (validation.data.taskSlug !== existingTask.taskSlug) {
            const existingSlug = await prisma.task.findUnique({
                where: { taskSlug: validation.data.taskSlug }
            });

            if (existingSlug) {
                return {
                    status: "error",
                    message: "A task with this slug already exists",
                };
            }
        }

        // Update the task
        await prisma.task.update({
            where: { id: taskId },
            data: {
                name: validation.data.name,
                taskSlug: validation.data.taskSlug,
            },
        });

        // Sync to procurement
        await syncTaskToProcurement(taskId);

        // OPTIMIZED: Use comprehensive cache invalidation
        // Removed revalidatePath (slow) - using invalidateTaskMutation instead
        await invalidateTaskMutation({
            taskId: taskId,
            projectId: existingTask.projectId,
            workspaceId: existingTask.project.workspaceId,
            userId: user.id
        });

        return {
            status: "success",
            message: "Task updated successfully",
        };

    } catch (err) {
        console.error("Error updating task:", err);
        return {
            status: "error",
            message: "We couldn't update the task. Please try again.",
        }
    }
}