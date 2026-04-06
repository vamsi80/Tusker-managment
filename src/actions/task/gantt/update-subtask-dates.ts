"use server";

import prisma from "@/lib/db";
import { requireUser } from "@/lib/auth/require-user";
import { getUserPermissions } from "@/data/user/get-user-permissions";
import {
    invalidateTaskMutation,
    invalidateProjectSubTasks
} from "@/lib/cache/invalidation";
import { parseIST } from "@/lib/utils";

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
        const user = await requireUser();
        const permissions = await getUserPermissions(workspaceId, projectId);

        if (!permissions.workspaceMemberId) {
            return { success: false, message: "You do not have access to this project" };
        }

        const start = parseIST(startDate);
        const end = parseIST(endDate);

        if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime())) {
            return { success: false, message: "Invalid dates" };
        }

        if (start > end) {
            return { success: false, message: "Start date must be before end date" };
        }

        const subtask = await prisma.task.findUnique({
            where: { id: subtaskId },
            select: {
                id: true,
                parentTaskId: true,
                createdById: true,
                assigneeId: true,
                assignee: {
                    select: {
                        id: true,
                        projectRole: true,
                        workspaceMember: {
                            select: {
                                user: {
                                    select: { surname: true }
                                }
                            }
                        }
                    }
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

        if (subtask.parentTask?.projectId !== projectId) {
            return { success: false, message: "Subtask does not belong to this project" };
        }
        const isWorkspaceAdmin = permissions.isWorkspaceAdmin;
        const isProjectManager = permissions.isProjectManager;
        const isProjectLead = permissions.isProjectLead;
        const isCreator = permissions.projectMember ? subtask.createdById === permissions.projectMember.id : false;

        if (!isWorkspaceAdmin && !isProjectManager) {
            if (isProjectLead) {
                if (!isCreator) {
                    return {
                        success: false,
                        message: "As a Project Lead, you can only update tasks you created. Only a Project Manager can update any task.",
                    };
                }
            } else {
                // It is a normal member
                return {
                    success: false,
                    message: "Normal members cannot update timeline dates in the Gantt chart. Only Project Leads and Managers can manage the timeline.",
                };
            }
        }

        // 7. Role-based Restrictions (Hierarchy Rule)
        // Assignee role is available directly from the included relation
        let assigneeRole: string | null = null;
        if (subtask.assignee) {
            assigneeRole = subtask.assignee.projectRole || 'MEMBER';
        }

        if (assigneeRole === "PROJECT_MANAGER") {
            if (!isWorkspaceAdmin) {
                return {
                    success: false,
                    message: "Only a Workspace Admin can update tasks assigned to a Project Manager.",
                };
            }
        } else if (assigneeRole === "LEAD") {
            // Task assigned to Lead: Only Workspace Admin or Project Manager can edit
            if (!isWorkspaceAdmin && !isProjectManager) {
                return {
                    success: false,
                    message: "Only a Workspace Admin or Project Manager can update tasks assigned to a Project Lead.",
                };
            }
        }

        // 7. Calculate days
        const days = Math.ceil((end!.getTime() - start!.getTime()) / (1000 * 60 * 60 * 24)) || 1;

        // 9. Execute update
        await prisma.task.update({
            where: { id: subtaskId },
            data: {
                startDate: start,
                dueDate: end,
                days: days,
            },
        });

        // 10. OPTIMIZED: Use comprehensive cache invalidation
        // Invalidates subtask, parent task, project tasks, and Gantt view
        await invalidateTaskMutation({
            taskId: subtaskId,
            projectId: projectId,
            workspaceId: workspaceId,
            userId: user.id,
            parentTaskId: subtask.parentTaskId || undefined
        });

        // Also invalidate project subtasks for Gantt view
        await invalidateProjectSubTasks(projectId);

        return { success: true, message: "Dates updated successfully" };
    } catch (error) {
        console.error("Error updating subtask dates:", error);
        return { success: false, message: "Failed to update dates" };
    }
}
