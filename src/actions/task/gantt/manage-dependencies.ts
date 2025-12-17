"use server";

import prisma from "@/lib/db";
import { getUserPermissions } from "@/data/user/get-user-permissions";
import { revalidateTag } from "next/cache";

export interface DependencyResult {
    success: boolean;
    message: string;
}

/**
 * Add a dependency between two subtasks
 * 
 * Permission Rules:
 * - Project admin/lead can add dependencies
 * - Task creator can add dependencies to their tasks
 * - Prevents circular dependencies
 * - Auto-adjusts dependent task dates (Finish-to-Start)
 * 
 * @param subtaskId - The subtask that depends on another
 * @param dependsOnId - The subtask that must be completed first
 * @param projectId - Project ID for permission check
 * @param workspaceId - Workspace ID for permission check
 */
export async function addSubtaskDependency(
    subtaskId: string,
    dependsOnId: string,
    projectId: string,
    workspaceId: string
): Promise<DependencyResult> {
    try {
        // 2. Get user permissions
        const permissions = await getUserPermissions(workspaceId, projectId);

        if (!permissions.workspaceMemberId) {
            return { success: false, message: "You do not have access to this project" };
        }

        // 3. Prevent self-dependency
        if (subtaskId === dependsOnId) {
            return { success: false, message: "A task cannot depend on itself" };
        }

        // 4. Validate that both tasks exist and belong to the same project
        const [subtask, dependsOnTask] = await Promise.all([
            prisma.task.findUnique({
                where: { id: subtaskId },
                select: {
                    id: true,
                    parentTask: {
                        select: {
                            projectId: true,
                            createdById: true,
                        },
                    },
                    startDate: true,
                    days: true,
                },
            }),
            prisma.task.findUnique({
                where: { id: dependsOnId },
                select: {
                    id: true,
                    parentTask: {
                        select: {
                            projectId: true,
                        },
                    },
                    startDate: true,
                    days: true,
                },
            }),
        ]);

        if (!subtask || !dependsOnTask) {
            return { success: false, message: "One or both tasks not found" };
        }

        if (subtask.parentTask?.projectId !== projectId || dependsOnTask.parentTask?.projectId !== projectId) {
            return { success: false, message: "Tasks must belong to the same project" };
        }

        // 5. Check permissions
        const isAdminOrLead = permissions.isWorkspaceAdmin || permissions.isProjectLead;
        const isTaskCreator = subtask.parentTask?.createdById === permissions.workspaceMemberId;

        if (!isAdminOrLead && !isTaskCreator) {
            return {
                success: false,
                message: "You are not authorized to add dependencies. Only project admin, lead, or task creator can add dependencies.",
            };
        }

        // 6. Check for circular dependencies
        const hasCircularDependency = await checkCircularDependency(subtaskId, dependsOnId);
        if (hasCircularDependency) {
            return { success: false, message: "This would create a circular dependency" };
        }

        // 7. Add the dependency
        await prisma.task.update({
            where: { id: subtaskId },
            data: {
                dependsOn: {
                    connect: { id: dependsOnId },
                },
            },
        });

        // 8. Auto-adjust the dependent task's start date (Finish-to-Start)
        if (dependsOnTask.startDate && dependsOnTask.days && subtask.startDate) {
            const dependsOnEndDate = new Date(dependsOnTask.startDate);
            dependsOnEndDate.setDate(dependsOnEndDate.getDate() + dependsOnTask.days - 1);

            const newSubtaskStartDate = new Date(dependsOnEndDate);
            newSubtaskStartDate.setDate(newSubtaskStartDate.getDate() + 1);

            // Only update if the dependent task would start before the predecessor ends
            if (subtask.startDate < newSubtaskStartDate) {
                await prisma.task.update({
                    where: { id: subtaskId },
                    data: {
                        startDate: newSubtaskStartDate,
                    },
                });
            }
        }

        // 9. Revalidate caches
        revalidateTag(`project-tasks-${projectId}`);
        revalidateTag(`task-subtasks-all`);

        return { success: true, message: "Dependency added successfully" };
    } catch (error) {
        console.error("Error adding dependency:", error);
        return { success: false, message: "Failed to add dependency" };
    }
}

/**
 * Remove a dependency between two subtasks
 * 
 * Permission Rules:
 * - Project admin/lead can remove dependencies
 * - Task creator can remove dependencies from their tasks
 */
export async function removeSubtaskDependency(
    subtaskId: string,
    dependsOnId: string,
    projectId: string,
    workspaceId: string
): Promise<DependencyResult> {
    try {
        // 2. Get user permissions
        const permissions = await getUserPermissions(workspaceId, projectId);

        if (!permissions.workspaceMemberId) {
            return { success: false, message: "You do not have access to this project" };
        }

        // 3. Fetch the subtask to check permissions
        const subtask = await prisma.task.findUnique({
            where: { id: subtaskId },
            select: {
                id: true,
                parentTask: {
                    select: {
                        projectId: true,
                        createdById: true,
                    },
                },
            },
        });

        if (!subtask) {
            return { success: false, message: "Subtask not found" };
        }

        if (subtask.parentTask?.projectId !== projectId) {
            return { success: false, message: "Subtask does not belong to this project" };
        }

        // 4. Check permissions
        const isAdminOrLead = permissions.isWorkspaceAdmin || permissions.isProjectLead;
        const isTaskCreator = subtask.parentTask?.createdById === permissions.workspaceMemberId;

        if (!isAdminOrLead && !isTaskCreator) {
            return {
                success: false,
                message: "You are not authorized to remove dependencies. Only project admin, lead, or task creator can remove dependencies.",
            };
        }

        // 5. Remove the dependency
        await prisma.task.update({
            where: { id: subtaskId },
            data: {
                dependsOn: {
                    disconnect: { id: dependsOnId },
                },
            },
        });

        // 6. Revalidate caches
        revalidateTag(`project-tasks-${projectId}`);
        revalidateTag(`task-subtasks-all`);

        return { success: true, message: "Dependency removed successfully" };
    } catch (error) {
        console.error("Error removing dependency:", error);
        return { success: false, message: "Failed to remove dependency" };
    }
}

/**
 * Check if adding a dependency would create a circular reference
 */
async function checkCircularDependency(subtaskId: string, dependsOnId: string): Promise<boolean> {
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
                    select: { id: true },
                },
            },
        });

        if (task?.dependsOn) {
            queue.push(...task.dependsOn.map((t) => t.id));
        }
    }

    return false;
}
