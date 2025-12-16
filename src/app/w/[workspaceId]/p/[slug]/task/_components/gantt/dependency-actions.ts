"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/require-user";
import prisma from "@/lib/db";

interface AddDependencyResult {
    success: boolean;
    message: string;
}

/**
 * Add a dependency between two subtasks
 * @param subtaskId - The subtask that depends on another
 * @param dependsOnId - The subtask that must be completed first
 * @param projectId - Project ID for revalidation
 * @param workspaceId - Workspace ID for revalidation
 */
export async function addSubtaskDependency(
    subtaskId: string,
    dependsOnId: string,
    projectId: string,
    workspaceId: string
): Promise<AddDependencyResult> {
    try {
        const user = await requireUser();

        // Validate that both tasks exist and belong to the same project
        const [subtask, dependsOnTask] = await Promise.all([
            prisma.task.findUnique({
                where: { id: subtaskId },
                select: { id: true, projectId: true, parentTaskId: true }
            }),
            prisma.task.findUnique({
                where: { id: dependsOnId },
                select: { id: true, projectId: true, parentTaskId: true }
            })
        ]);

        if (!subtask || !dependsOnTask) {
            return { success: false, message: "One or both tasks not found" };
        }

        if (subtask.projectId !== projectId || dependsOnTask.projectId !== projectId) {
            return { success: false, message: "Tasks must belong to the same project" };
        }

        // Prevent self-dependency
        if (subtaskId === dependsOnId) {
            return { success: false, message: "A task cannot depend on itself" };
        }

        // Check for circular dependencies
        const hasCircularDependency = await checkCircularDependency(subtaskId, dependsOnId);
        if (hasCircularDependency) {
            return { success: false, message: "This would create a circular dependency" };
        }

        // Add the dependency
        await prisma.task.update({
            where: { id: subtaskId },
            data: {
                dependsOn: {
                    connect: { id: dependsOnId }
                }
            }
        });

        // Revalidate the project page
        revalidatePath(`/w/${workspaceId}/p/${projectId}/task`);

        return { success: true, message: "Dependency added successfully" };
    } catch (error) {
        console.error("Error adding dependency:", error);
        return { success: false, message: "Failed to add dependency" };
    }
}

/**
 * Remove a dependency between two subtasks
 */
export async function removeSubtaskDependency(
    subtaskId: string,
    dependsOnId: string,
    projectId: string,
    workspaceId: string
): Promise<AddDependencyResult> {
    try {
        const user = await requireUser();

        await prisma.task.update({
            where: { id: subtaskId },
            data: {
                dependsOn: {
                    disconnect: { id: dependsOnId }
                }
            }
        });

        // Revalidate the project page
        revalidatePath(`/w/${workspaceId}/p/${projectId}/task`);

        return { success: true, message: "Dependency removed successfully" };
    } catch (error) {
        console.error("Error removing dependency:", error);
        return { success: false, message: "Failed to remove dependency" };
    }
}

/**
 * Check if adding a dependency would create a circular reference
 */
async function checkCircularDependency(
    subtaskId: string,
    dependsOnId: string
): Promise<boolean> {
    // Get all dependencies of the dependsOnId task
    const visited = new Set<string>();
    const queue = [dependsOnId];

    while (queue.length > 0) {
        const currentId = queue.shift()!;

        if (visited.has(currentId)) continue;
        visited.add(currentId);

        // If we find the original subtask in the dependency chain, it's circular
        if (currentId === subtaskId) {
            return true;
        }

        // Get dependencies of current task
        const task = await prisma.task.findUnique({
            where: { id: currentId },
            select: {
                dependsOn: {
                    select: { id: true }
                }
            }
        });

        if (task?.dependsOn) {
            queue.push(...task.dependsOn.map(t => t.id));
        }
    }

    return false;
}
