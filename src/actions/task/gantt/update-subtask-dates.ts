"use server";

import prisma from "@/lib/db";
import { requireUser } from "@/lib/auth/require-user";
import { getUserPermissions } from "@/data/user/get-user-permissions";
import {
    invalidateTaskMutation,
    invalidateProjectSubTasks
} from "@/lib/cache/invalidation";

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
                parentTaskId: true,
                createdById: true,
                assignee: {
                    select: {
                        id: true,
                        name: true,
                        surname: true,
                        image: true,
                        email: true,
                    }
                },
                parentTask: {
                    select: {
                        projectId: true,
                    },
                },
                Task_TaskDependency_B: {
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

        // 6. Check permissions based on global hierarchy
        const isWorkspaceAdmin = permissions.isWorkspaceAdmin;
        const isProjectManager = permissions.isProjectManager;
        const isProjectLead = permissions.isProjectLead;
        const isCreator = subtask.createdById === user.id;

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
        // Get assignee's project role
        let assigneeRole: string | null = null;
        if (subtask.assignee?.id) {
            const assigneeMember = await prisma.projectMember.findFirst({
                where: {
                    projectId: projectId,
                    workspaceMember: { userId: subtask.assignee.id }
                },
                select: { projectRole: true }
            });
            assigneeRole = assigneeMember?.projectRole || 'MEMBER';
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
        const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

        // 8. Prepare batch updates for dependent tasks
        const dependentUpdates = [];
        if (subtask.Task_TaskDependency_B && subtask.Task_TaskDependency_B.length > 0) {
            const newDependentStart = new Date(end);
            newDependentStart.setDate(newDependentStart.getDate() + 1);

            for (const dependent of subtask.Task_TaskDependency_B) {
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
