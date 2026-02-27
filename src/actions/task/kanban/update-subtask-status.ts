"use server";

import prisma from "@/lib/db";
import { requireUser } from "@/lib/auth/require-user";
import { getUserPermissions } from "@/data/user/get-user-permissions";
import { headers } from "next/headers";
import {
    invalidateTaskMutation,
    invalidateProjectSubTasks
} from "@/lib/cache/invalidation";

type TaskStatus = "TO_DO" | "IN_PROGRESS" | "CANCELLED" | "REVIEW" | "HOLD" | "COMPLETED";

interface UpdateSubTaskStatusResult {
    success: boolean;
    error?: string;
    subTask?: {
        id: string;
        status: TaskStatus;
        updatedAt: Date;
    };
    auditLog?: {
        id: string;
        operationId: string;
        action: string;
        timestamp: Date;
    };
}

/**
 * Update subtask status with permission validation and comprehensive audit logging
 * 
 * Permission Rules:
 * - Only assignee, project admin, or project lead can move cards
 * - Only admin/lead can move to COMPLETED, CANCELLED, or HOLD
 * - Moving to REVIEW requires a review comment (comment or attachment)
 * - All moves are logged to both legacy and new audit tables
 * 
 * Idempotency:
 * - Uses operationId to prevent duplicate operations
 * - Returns cached result if operation already processed
 * 
 * @param subTaskId - ID of the subtask to update
 * @param newStatus - New status to set
 * @param workspaceId - Workspace ID for permission check
 * @param projectId - Project ID for permission check
 * @param operationId - Unique operation ID for idempotency
 * @param reviewCommentId - Review comment ID (required when moving to REVIEW)
 */
export async function updateSubTaskStatus(
    subTaskId: string,
    newStatus: TaskStatus,
    workspaceId: string,
    projectId: string,
    operationId?: string,
    reviewCommentId?: string
): Promise<UpdateSubTaskStatusResult> {
    try {
        // 1. Authenticate user
        const user = await requireUser();

        // 2. Generate operation ID if not provided
        const opId = operationId || `move-${subTaskId}-${newStatus}-${Date.now()}`;

        // 4. Get user permissions
        const permissions = await getUserPermissions(workspaceId, projectId);

        if (!permissions.workspaceMemberId) {
            return {
                success: false,
                error: "You do not have access to this project",
            };
        }

        // 5. Fetch the subtask with current assignee
        const subTask = await prisma.task.findUnique({
            where: { id: subTaskId },
            select: {
                id: true,
                projectId: true,
                parentTaskId: true,
                name: true,
                status: true,
                description: true,
                startDate: true,
                days: true,
                createdById: true,
                assigneeTo: true,      // FK — avoids JOIN
            },
        });

        if (!subTask) {
            return {
                success: false,
                error: "Subtask not found",
            };
        }

        // 6. Verify subtask belongs to the project
        if (subTask.projectId !== projectId) {
            return {
                success: false,
                error: "Subtask does not belong to this project",
            };
        }

        // 7. Check if user is authorized to move this card
        // 7. Check if user is authorized to edit this task (move/update)
        const isWorkspaceAdmin = permissions.isWorkspaceAdmin;
        const isProjectManager = permissions.isProjectManager;
        const isProjectLead = permissions.isProjectLead;
        const isCreator = subTask.createdById === user.id;
        const isAssignee = subTask.assigneeTo === user.id;

        // Basic Authorization check
        if (!isWorkspaceAdmin && !isProjectManager) {
            if (isProjectLead) {
                // Leads can edit tasks they created OR tasks assigned to them
                if (!isCreator && !isAssignee) {
                    return {
                        success: false,
                        error: "As a Project Lead, you can only update tasks you created or are assigned to. Only the Project Manager can update any task in this project.",
                    };
                }
            } else {
                // Members/Regular users can only move tasks they created or are assigned to
                if (!isCreator && !isAssignee) {
                    return {
                        success: false,
                        error: "You can only update tasks that you created or are assigned to.",
                    };
                }
            }
        }

        // 8. Role-based Status Transition Restrictions (Hierarchy Rule)
        // Restrict ANY move if assigned to a superior (PM tasks Admin-only, Lead tasks PM/Admin-only)
        let assigneeRole: string | null = null;
        if (subTask.assigneeTo) {
            const assigneeMember = await prisma.projectMember.findFirst({
                where: {
                    projectId: projectId,
                    workspaceMember: { userId: subTask.assigneeTo }
                },
                select: { projectRole: true }
            });
            assigneeRole = assigneeMember?.projectRole || "MEMBER";
        }

        if (assigneeRole === "PROJECT_MANAGER") {
            if (!isWorkspaceAdmin) {
                return {
                    success: false,
                    error: "Only a Workspace Admin can move a task assigned to a Project Manager",
                };
            }
        } else if (assigneeRole === "LEAD") {
            if (!isWorkspaceAdmin && !isProjectManager) {
                return {
                    success: false,
                    error: "Only a Workspace Admin or Project Manager can move a task assigned to a Lead.",
                };
            }
        }

        const privilegedStatuses = ["COMPLETED", "CANCELLED", "HOLD"];
        if (privilegedStatuses.includes(newStatus)) {
            // Additional privileged status logic (if any) could go here
        }

        // 9. Validate review comment for REVIEW status
        if (newStatus === "REVIEW") {
            // Check if a review comment was provided
            if (!reviewCommentId) {
                return {
                    success: false,
                    error: "A comment or attachment is required when moving to REVIEW status",
                };
            }

            // Verify the review comment exists and belongs to this subtask
            const reviewComment = await prisma.reviewComment.findUnique({
                where: { id: reviewCommentId },
                select: {
                    id: true,
                    subTaskId: true,
                },
            });

            if (!reviewComment) {
                return {
                    success: false,
                    error: "Invalid review comment",
                };
            }

            if (reviewComment.subTaskId !== subTaskId) {
                return {
                    success: false,
                    error: "Review comment does not belong to this subtask",
                };
            }
        }

        // 10. Don't update if status hasn't changed
        if (subTask.status === newStatus) {
            return {
                success: true,
                subTask: {
                    id: subTask.id,
                    status: newStatus,
                    updatedAt: new Date(),
                },
            };
        }

        // 11. Get request metadata
        const headersList = await headers();
        const ipAddress = headersList.get("x-forwarded-for") || headersList.get("x-real-ip") || "unknown";
        const userAgent = headersList.get("user-agent") || "unknown";

        // 12. Update subtask status and create audit log in a transaction
        const result = await prisma.$transaction(async (tx) => {
            // Update the subtask
            const updated = await tx.task.update({
                where: { id: subTaskId },
                data: { status: newStatus },
                select: {
                    id: true,
                    status: true,
                    updatedAt: true,
                },
            });

            return { updated };
        });

        // 13. OPTIMIZED: Use comprehensive cache invalidation
        // Invalidates: subtask, parent task, project tasks, workspace tasks
        await invalidateTaskMutation({
            taskId: subTaskId,
            projectId: projectId,
            workspaceId: workspaceId,
            userId: user.id,
            // CHANGED: Use correct parentTaskId
            parentTaskId: subTask.parentTaskId || undefined
        });

        // Also invalidate project subtasks for Kanban view
        await invalidateProjectSubTasks(projectId);

        return {
            success: true,
            subTask: {
                id: result.updated.id,
                status: result.updated.status as TaskStatus,
                updatedAt: result.updated.updatedAt,
            }
        };
    } catch (error) {
        console.error("Error updating subtask status:", error);
        return {
            success: false,
            error: "An unexpected error occurred while updating the subtask status. Please try again.",
        };
    }
}
