"use server";

import prisma from "@/lib/db";
import { requireUser } from "@/lib/auth/require-user";
import { getUserPermissions } from "@/data/user/get-user-permissions";
import { revalidatePath, revalidateTag } from "next/cache";

export interface UpdatePositionInput {
    subtaskId: string;
    newPosition: number;
}

export interface UpdatePositionsResult {
    success: boolean;
    message: string;
}

/**
 * Update the position of subtasks within a parent task
 * Used for drag-and-drop reordering in Gantt chart
 * 
 * Permission Rules:
 * - Project admin/lead can reorder any subtasks
 * - Task creator can reorder their own subtasks
 * - Regular members cannot reorder
 * 
 * @param parentTaskId - ID of the parent task
 * @param projectId - Project ID for permission check
 * @param workspaceId - Workspace ID for permission check
 * @param updates - Array of subtask ID and new position pairs
 */
export async function updateSubtaskPositions(
    parentTaskId: string,
    projectId: string,
    workspaceId: string,
    updates: UpdatePositionInput[]
): Promise<UpdatePositionsResult> {
    try {
        // 1. Authenticate user
        const user = await requireUser();

        // 2. Get user permissions
        const permissions = await getUserPermissions(workspaceId, projectId);

        if (!permissions.workspaceMemberId) {
            return { success: false, message: "You do not have access to this project" };
        }

        // 3. Check if user is authorized to reorder
        const isAdminOrLead = permissions.isWorkspaceAdmin || permissions.isProjectLead;

        if (!isAdminOrLead) {
            // Check if user created the parent task
            const parentTask = await prisma.task.findUnique({
                where: { id: parentTaskId },
                select: {
                    createdById: true,
                    parentTask: {
                        select: {
                            projectId: true,
                        },
                    },
                },
            });

            if (!parentTask) {
                return { success: false, message: "Parent task not found" };
            }

            if (parentTask.parentTask?.projectId !== projectId) {
                return { success: false, message: "Task does not belong to this project" };
            }

            if (parentTask.createdById !== permissions.workspaceMemberId) {
                return {
                    success: false,
                    message: "You are not authorized to reorder subtasks. Only the task creator, project admin, or project lead can reorder subtasks.",
                };
            }
        }

        // 4. Validate updates array
        if (!updates || updates.length === 0) {
            return { success: false, message: "No updates provided" };
        }

        // 5. Update positions in a transaction
        await prisma.$transaction(
            updates.map((update) =>
                prisma.task.update({
                    where: { id: update.subtaskId },
                    data: { position: update.newPosition },
                })
            )
        );

        // 6. Revalidate caches
        revalidateTag(`project-tasks-${projectId}`);
        revalidateTag(`task-subtasks-${parentTaskId}`);
        revalidatePath(`/w/${workspaceId}/p/[slug]/task`, "page");

        return { success: true, message: "Positions updated successfully" };
    } catch (error) {
        console.error("Error updating subtask positions:", error);
        return { success: false, message: "Failed to update positions" };
    }
}
