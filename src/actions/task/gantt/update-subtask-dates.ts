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

        // 2. Get user permissions
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

        // 4. Fetch the subtask with assignee info
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

        // 8. Update the subtask
        await prisma.task.update({
            where: { id: subtaskId },
            data: {
                startDate: start,
                days: days,
            },
        });

        // 9. Auto-update dependent tasks (Finish-to-Start)
        const taskWithDependents = await prisma.task.findUnique({
            where: { id: subtaskId },
            include: {
                dependedBy: {
                    select: {
                        id: true,
                        startDate: true,
                        days: true,
                    },
                },
            },
        });

        if (taskWithDependents?.dependedBy && taskWithDependents.dependedBy.length > 0) {
            const newDependentStart = new Date(end);
            newDependentStart.setDate(newDependentStart.getDate() + 1); // Next day after predecessor ends

            for (const dependent of taskWithDependents.dependedBy) {
                if (dependent.startDate && dependent.days) {
                    // Only update if the dependent would start before the predecessor ends
                    if (dependent.startDate < newDependentStart) {
                        await prisma.task.update({
                            where: { id: dependent.id },
                            data: {
                                startDate: newDependentStart,
                            },
                        });
                    }
                }
            }
        }

        // 10. Revalidate caches
        revalidateTag(`project-tasks-${projectId}`);
        revalidateTag(`project-tasks-user-${user.id}`);
        revalidateTag(`task-subtasks-all`);

        return { success: true, message: "Dates updated successfully" };
    } catch (error) {
        console.error("Error updating subtask dates:", error);
        return { success: false, message: "Failed to update dates" };
    }
}
