"use server";

import prisma from "@/lib/db";
import { requireUser } from "@/app/data/user/require-user";
import { getUserPermissions } from "@/app/data/user/get-user-permissions";
import { revalidatePath } from "next/cache";

interface UpdatePositionInput {
    subtaskId: string;
    newPosition: number;
}

/**
 * Update the position of subtasks within a parent task
 * Used for drag-and-drop reordering in Gantt chart
 */
export async function updateSubtaskPositions(
    parentTaskId: string,
    projectId: string,
    workspaceId: string,
    updates: UpdatePositionInput[]
) {
    const user = await requireUser();

    try {
        // Check permissions
        const permissions = await getUserPermissions(workspaceId, projectId);

        if (!permissions.workspaceMemberId) {
            return { success: false, message: "Not a workspace member" };
        }

        // Only admins, leads, or task creators can reorder
        const isAdminOrLead = permissions.isWorkspaceAdmin || permissions.isProjectLead;

        if (!isAdminOrLead) {
            // Check if user created the parent task
            const parentTask = await prisma.task.findUnique({
                where: { id: parentTaskId },
                select: { createdById: true }
            });

            if (parentTask?.createdById !== permissions.workspaceMemberId) {
                return { success: false, message: "Not authorized to reorder subtasks" };
            }
        }

        // Update positions in a transaction
        await prisma.$transaction(
            updates.map(update =>
                prisma.task.update({
                    where: { id: update.subtaskId },
                    data: { position: update.newPosition }
                })
            )
        );

        // Revalidate the task page
        revalidatePath(`/w/${workspaceId}/p/${projectId}/task`);

        return { success: true, message: "Positions updated successfully" };
    } catch (error) {
        console.error("Error updating subtask positions:", error);
        return { success: false, message: "Failed to update positions" };
    }
}

/**
 * Add a dependency between two subtasks
 * The child subtask will depend on the parent subtask (Finish-to-Start)
 */
export async function addSubtaskDependency(
    childSubtaskId: string,
    parentSubtaskId: string,
    projectId: string,
    workspaceId: string
) {
    const user = await requireUser();

    try {
        // Check permissions
        const permissions = await getUserPermissions(workspaceId, projectId);

        if (!permissions.workspaceMemberId) {
            return { success: false, message: "Not a workspace member" };
        }

        // Verify both subtasks exist and belong to the same parent task
        const [childTask, parentTask] = await Promise.all([
            prisma.task.findUnique({
                where: { id: childSubtaskId },
                select: { id: true, parentTaskId: true, name: true }
            }),
            prisma.task.findUnique({
                where: { id: parentSubtaskId },
                select: { id: true, parentTaskId: true, name: true }
            })
        ]);

        if (!childTask || !parentTask) {
            return { success: false, message: "Subtask not found" };
        }

        if (childTask.parentTaskId !== parentTask.parentTaskId) {
            return { success: false, message: "Subtasks must belong to the same parent task" };
        }

        // Prevent self-dependency
        if (childSubtaskId === parentSubtaskId) {
            return { success: false, message: "Cannot depend on itself" };
        }

        // Add the dependency
        await prisma.task.update({
            where: { id: childSubtaskId },
            data: {
                dependsOn: {
                    connect: { id: parentSubtaskId }
                }
            }
        });

        // Revalidate the task page
        revalidatePath(`/w/${workspaceId}/p/${projectId}/task`);

        return {
            success: true,
            message: `"${childTask.name}" now depends on "${parentTask.name}"`
        };
    } catch (error) {
        console.error("Error adding dependency:", error);
        return { success: false, message: "Failed to add dependency" };
    }
}

/**
 * Remove a dependency between two subtasks
 */
export async function removeSubtaskDependency(
    childSubtaskId: string,
    parentSubtaskId: string,
    projectId: string,
    workspaceId: string
) {
    const user = await requireUser();

    try {
        // Check permissions
        const permissions = await getUserPermissions(workspaceId, projectId);

        if (!permissions.workspaceMemberId) {
            return { success: false, message: "Not a workspace member" };
        }

        // Remove the dependency
        await prisma.task.update({
            where: { id: childSubtaskId },
            data: {
                dependsOn: {
                    disconnect: { id: parentSubtaskId }
                }
            }
        });

        // Revalidate the task page
        revalidatePath(`/w/${workspaceId}/p/${projectId}/task`);

        return { success: true, message: "Dependency removed" };
    } catch (error) {
        console.error("Error removing dependency:", error);
        return { success: false, message: "Failed to remove dependency" };
    }
}
