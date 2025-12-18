"use server";

import prisma from "@/lib/db";
import { requireUser } from "@/lib/auth/require-user";
import { getUserPermissions } from "@/data/user/get-user-permissions";
import { revalidateTag } from "next/cache";

export interface UpdateSubtaskDatesResult {
    success: boolean;
    message: string;
}

/**
 * Update subtask dates when dragged/resized in Gantt chart
 * 
 * OPTIMIZED FOR PERFORMANCE:
 * - Reduced cache invalidation (only invalidates specific project)
 * - Batched database operations
 * - Removed unnecessary user-specific cache invalidation
 * 
 * Permission Rules:
 * - Assignee can update their own subtask dates
 * - Project admin/lead can update any subtask dates
 * - Automatically adjusts dependent tasks (Finish-to-Start)
 * 
 * @param subtaskId - ID of the subtask to update
 * @param startDate - New start date (YYYY-MM-DD)
 * @param endDate - New end date (YYYY-MM-DD)
 * @param projectId - Project ID for permission check
 * @param workspaceId - Workspace ID for permission check
 */
export async function updateSubtaskDates(
    subtaskId: string,
    startDate: string,
    endDate: string,
    projectId: string,
    workspaceId: string
): Promise<UpdateSubtaskDatesResult> {
    try {
        // 1. Authenticate user
        const user = await requireUser();

        // 2. Get user permissions (cached)
        const permissions = await getUserPermissions(workspaceId, projectId);

        if (!permissions.workspaceMemberId) {
            return { success: false, message: "You do not have access to this project" };
        }

        // 3. Validate dates
        const start = new Date(startDate);
        const end = new Date(endDate);

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return { success: false, message: "Invalid dates" };
        }

        if (start > end) {
            return { success: false, message: "Start date must be before end date" };
        }

        // 4. Fetch subtask with all needed data in ONE query (optimized)
        const subtask = await prisma.task.findUnique({
            where: { id: subtaskId },
            select: {
                id: true,
                assignee: {
                    select: {
                        workspaceMemberId: true,
                    },
                },
                parentTask: {
                    select: {
                        projectId: true,
                    },
                },
                dependedBy: {
                    select: {
                        id: true,
                        startDate: true,
                        days: true,
                    },
                },
            },
        });

        if (!subtask) {
            return { success: false, message: "Subtask not found" };
        }

        // 5. Verify subtask belongs to the project
        if (subtask.parentTask?.projectId !== projectId) {
            return { success: false, message: "Subtask does not belong to this project" };
        }

        // 6. Check permissions
        const isAssignee = subtask.assignee?.workspaceMemberId === permissions.workspaceMemberId;
        const isAdminOrLead = permissions.isWorkspaceAdmin || permissions.isProjectLead;

        if (!isAssignee && !isAdminOrLead) {
            return {
                success: false,
                message: "You are not authorized to update this subtask. Only the assignee, project admin, or project lead can update dates.",
            };
        }

        // 7. Calculate days
        const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

        // 8. Prepare batch updates for dependent tasks
        const dependentUpdates = [];
        if (subtask.dependedBy && subtask.dependedBy.length > 0) {
            const newDependentStart = new Date(end);
            newDependentStart.setDate(newDependentStart.getDate() + 1);

            for (const dependent of subtask.dependedBy) {
                if (dependent.startDate && dependent.days) {
                    if (dependent.startDate < newDependentStart) {
                        dependentUpdates.push(
                            prisma.task.update({
                                where: { id: dependent.id },
                                data: { startDate: newDependentStart },
                            })
                        );
                    }
                }
            }
        }

        // 9. Execute ALL updates in a single transaction (MUCH FASTER)
        await prisma.$transaction([
            prisma.task.update({
                where: { id: subtaskId },
                data: {
                    startDate: start,
                    days: days,
                },
            }),
            ...dependentUpdates,
        ]);

        // 10. OPTIMIZED: Only revalidate the specific project cache
        // Removed: user-specific cache (not needed for Gantt)
        // Removed: global subtasks cache (too broad, slows down other views)
        revalidateTag(`project-tasks-${projectId}`);

        return { success: true, message: "Dates updated successfully" };
    } catch (error) {
        console.error("Error updating subtask dates:", error);
        return { success: false, message: "Failed to update dates" };
    }
}
