"use server";

import prisma from "@/lib/db";
import { requireUser } from "@/lib/auth/require-user";
import { revalidateTag } from "next/cache";

interface UpdateSubtaskDatesResult {
    success: boolean;
    message: string;
}

/**
 * Update subtask dates when dragged/resized in Gantt chart
 */
export async function updateSubtaskDates(
    subtaskId: string,
    startDate: string, // YYYY-MM-DD
    endDate: string,   // YYYY-MM-DD
    projectId: string,
    workspaceId: string
): Promise<UpdateSubtaskDatesResult> {
    try {
        const user = await requireUser();

        // Validate dates
        const start = new Date(startDate);
        const end = new Date(endDate);

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return { success: false, message: "Invalid dates" };
        }

        if (start > end) {
            return { success: false, message: "Start date must be before end date" };
        }

        // Calculate days
        const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

        // Update the subtask
        await prisma.task.update({
            where: { id: subtaskId },
            data: {
                startDate: start,
                days: days
            }
        });

        // Check if this task has dependents and update them
        const task = await prisma.task.findUnique({
            where: { id: subtaskId },
            include: {
                dependedBy: {
                    select: {
                        id: true,
                        startDate: true,
                        days: true
                    }
                }
            }
        });

        // Auto-update dependent tasks (Finish-to-Start)
        if (task?.dependedBy && task.dependedBy.length > 0) {
            const newDependentStart = new Date(end);
            newDependentStart.setDate(newDependentStart.getDate() + 1); // Next day after predecessor ends

            for (const dependent of task.dependedBy) {
                if (dependent.startDate && dependent.days) {
                    // Only update if the dependent would start before the predecessor ends
                    if (dependent.startDate < newDependentStart) {
                        await prisma.task.update({
                            where: { id: dependent.id },
                            data: {
                                startDate: newDependentStart
                            }
                        });
                    }
                }
            }
        }

        // Revalidate cache tags instead of path for better cache control
        revalidateTag(`project-tasks-${projectId}`);
        revalidateTag(`project-tasks-user-${user.id}`);
        revalidateTag(`task-subtasks-all`);

        return { success: true, message: "Dates updated successfully" };
    } catch (error) {
        console.error("Error updating subtask dates:", error);
        return { success: false, message: "Failed to update dates" };
    }
}

/**
 * Create a dependency by dragging an arrow from one task to another
 */
export async function createDependencyByDrag(
    fromSubtaskId: string,
    toSubtaskId: string,
    projectId: string,
    workspaceId: string
): Promise<UpdateSubtaskDatesResult> {
    try {
        const user = await requireUser();

        // Prevent self-dependency
        if (fromSubtaskId === toSubtaskId) {
            return { success: false, message: "Cannot depend on itself" };
        }

        // Check for circular dependencies
        const hasCircular = await checkCircularDependency(toSubtaskId, fromSubtaskId);
        if (hasCircular) {
            return { success: false, message: "This would create a circular dependency" };
        }

        // Get both tasks
        const [fromTask, toTask] = await Promise.all([
            prisma.task.findUnique({
                where: { id: fromSubtaskId },
                select: { id: true, startDate: true, days: true }
            }),
            prisma.task.findUnique({
                where: { id: toSubtaskId },
                select: { id: true, startDate: true, days: true }
            })
        ]);

        if (!fromTask || !toTask) {
            return { success: false, message: "Task not found" };
        }

        // Add the dependency
        await prisma.task.update({
            where: { id: toSubtaskId },
            data: {
                dependsOn: {
                    connect: { id: fromSubtaskId }
                }
            }
        });

        // Auto-adjust the dependent task's start date
        if (fromTask.startDate && fromTask.days && toTask.startDate) {
            const fromEndDate = new Date(fromTask.startDate);
            fromEndDate.setDate(fromEndDate.getDate() + fromTask.days - 1);

            const newToStartDate = new Date(fromEndDate);
            newToStartDate.setDate(newToStartDate.getDate() + 1);

            // Only update if the dependent task would start before the predecessor ends
            if (toTask.startDate < newToStartDate) {
                await prisma.task.update({
                    where: { id: toSubtaskId },
                    data: {
                        startDate: newToStartDate
                    }
                });
            }
        }

        // Revalidate cache tags instead of path for better cache control
        revalidateTag(`project-tasks-${projectId}`);
        revalidateTag(`task-subtasks-all`);

        return { success: true, message: "Dependency created successfully" };
    } catch (error) {
        console.error("Error creating dependency:", error);
        return { success: false, message: "Failed to create dependency" };
    }
}

/**
 * Check if adding a dependency would create a circular reference
 */
async function checkCircularDependency(
    subtaskId: string,
    dependsOnId: string
): Promise<boolean> {
    const visited = new Set<string>();
    const queue = [dependsOnId];

    while (queue.length > 0) {
        const currentId = queue.shift()!;

        if (visited.has(currentId)) continue;
        visited.add(currentId);

        if (currentId === subtaskId) {
            return true;
        }

        const task = await prisma.task.findUnique({
            where: { id: currentId },
            select: {
                dependsOn: {
                    select: { id: true }
                }
            }
        });

        if (task?.dependsOn) {
            queue.push(...task.dependsOn.map((t: { id: string }) => t.id));
        }
    }

    return false;
}
