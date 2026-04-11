"use server";
import { getUserPermissions } from "@/data/user/get-user-permissions";
import { invalidateTaskMutation } from "@/lib/cache/invalidation";
import { getTaskInvolvedUserIds } from "@/lib/involved-users";
import { requireUser } from "@/lib/auth/require-user";
import prisma from "@/lib/db";
import { ApiResponse } from "@/lib/types";
import { TaskSchemaType, taskSchema } from "@/lib/zodSchemas";
import { syncTaskToProcurement } from "@/lib/procurement/logic";
import { resolveProjectMemberId } from "@/lib/auth/resolve-member-chain";

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
                },
                // Include createdBy chain for permission check
                createdBy: {
                    include: {
                        workspaceMember: {
                            select: { userId: true }
                        }
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
        const canEditOwnTasks = permissions.isProjectLead && existingTask.createdBy.workspaceMember.userId === user.id;

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

        // Resolve reviewerId to ProjectMember.id if provided
        let reviewerPMId: string | null | undefined = undefined;
        if (validation.data.reviewerId !== undefined) {
            if (validation.data.reviewerId) {
                reviewerPMId = await resolveProjectMemberId(
                    validation.data.reviewerId,
                    existingTask.project.id,
                    existingTask.project.workspaceId
                );
            } else {
                reviewerPMId = null;
            }
        }

        // Update the task
        await prisma.task.update({
            where: { id: taskId },
            data: {
                name: validation.data.name,
                taskSlug: validation.data.taskSlug,
                reviewerId: reviewerPMId,
            },
        });

        // 4. Record Activity & Broadcast
        const { recordActivity } = await import("@/lib/audit");
        const targetUserIds = await getTaskInvolvedUserIds(taskId);
        await recordActivity({
            userId: user.id,
            userName: (user as any).surname || user.name || "Someone",
            workspaceId: existingTask.project.workspaceId,
            action: "TASK_UPDATED",
            entityType: "TASK",
            entityId: taskId,
            oldData: {
                name: existingTask.name,
                taskSlug: existingTask.taskSlug,
                reviewerId: existingTask.reviewerId,
            },
            newData: {
                name: validation.data.name,
                taskSlug: validation.data.taskSlug,
                reviewerId: reviewerPMId,
            },
            broadcastEvent: "task_update"
        });

        // Sync to procurement
        await syncTaskToProcurement(taskId);

        // Return success (Surgical client sync is handled by recordActivity)
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