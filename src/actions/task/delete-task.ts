"use server";
import { getUserPermissions } from "@/data/user/get-user-permissions";
import { invalidateTaskMutation } from "@/lib/cache/invalidation";
import { requireUser } from "@/lib/auth/require-user";
import { revalidateTag } from "next/cache";
import prisma from "@/lib/db";
import { getTaskInvolvedUserIds } from "@/lib/involved-users";
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

        // 3. Fetch involved users BEFORE deletion
        const targetUserIds = await getTaskInvolvedUserIds(taskId);

        // 4. Delete the task
        await prisma.task.delete({
            where: { id: taskId },
        });

        // 5. RECORD ACTIVITY & BROADCAST (Structural Pinpoint Sync)
        try {
            const { recordActivity } = await import("@/lib/audit");
            
            await recordActivity({
                userId: user.id,
                userName: (user as any).surname || user.name || "Someone",
                workspaceId: existingTask.project.workspaceId,
                action: "TASK_DELETED",
                entityType: "TASK",
                entityId: taskId,
                oldData: { 
                    name: existingTask.name, 
                    status: existingTask.status,
                    projectId: existingTask.projectId // Essential for pinpoint removal
                },
                broadcastEvent: "team_update", // Triggers structural sync
                targetUserIds, 
            });
        } catch (e) {
            console.error("[PINPOINT_SYNC_ERROR] recordActivity failed:", e);
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