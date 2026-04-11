"use server"

import { getUserPermissions } from "@/data/user/get-user-permissions";
import { invalidateTaskMutation } from "@/lib/cache/invalidation";
import { requireUser } from "@/lib/auth/require-user";
import prisma from "@/lib/db";
import { getTaskInvolvedUserIds } from "@/lib/involved-users";
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
        const canDeleteOwnTasks = permissions.isProjectLead && permissions.projectMember && existingSubTask.createdById === permissions.projectMember.id;

        if (!canDeleteAllTasks && !canDeleteOwnTasks) {
            return {
                status: "error",
                message: permissions.isProjectLead
                    ? "You can only delete subtasks you created"
                    : "You don't have permission to delete this subtask",
            };
        }

        // 3. Fetch involved users BEFORE deletion
        const targetUserIds = await getTaskInvolvedUserIds(subTaskId);

        // 4. Delete the subtask and update parent counters in a transaction
        await prisma.$transaction(async (tx) => {
            await tx.task.delete({
                where: { id: subTaskId },
            });

            if (existingSubTask.parentTaskId) {
                await tx.task.update({
                    where: { id: existingSubTask.parentTaskId },
                    data: {
                        subtaskCount: { decrement: 1 },
                        completedSubtaskCount: existingSubTask.status === "COMPLETED" ? { decrement: 1 } : undefined
                    }
                });
            }
        });

        // 5. Record Activity & Broadcast
        const { recordActivity } = await import("@/lib/audit");
        await recordActivity({
            userId: user.id,
            userName: (user as any).surname || user.name || "Someone",
            workspaceId: existingSubTask.project.workspaceId,
            action: "SUBTASK_DELETED",
            entityType: "SUBTASK",
            entityId: subTaskId,
            oldData: { name: existingSubTask.name, status: existingSubTask.status },
            broadcastEvent: "task_update",
            targetUserIds, // Target involved people only
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