"use server";

import prisma from "@/lib/db";
import { requireUser } from "@/lib/auth/require-user";
import { getUserPermissions } from "@/data/user/get-user-permissions";
import { headers } from "next/headers";
import {
    invalidateTaskMutation,
    invalidateProjectSubTasks
} from "@/lib/cache/invalidation";

type TaskStatus = "TO_DO" | "IN_PROGRESS" | "BLOCKED" | "REVIEW" | "HOLD" | "COMPLETED";

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
 * - Only admin/lead can move to COMPLETED, BLOCKED, or HOLD
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

        // 3. Check for duplicate operation (idempotency)
        const existingAuditLog = await prisma.auditLog.findUnique({
            where: { operationId: opId },
            select: {
                id: true,
                action: true,
                timestamp: true,
                afterState: true,
            },
        });

        if (existingAuditLog) {
            // Operation already processed, return cached result
            const afterState = existingAuditLog.afterState as any;
            return {
                success: true,
                subTask: {
                    id: subTaskId,
                    status: afterState.status,
                    updatedAt: existingAuditLog.timestamp,
                },
                auditLog: {
                    id: existingAuditLog.id,
                    operationId: opId,
                    action: existingAuditLog.action,
                    timestamp: existingAuditLog.timestamp,
                },
            };
        }

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
                projectId: true, // ADDED
                parentTaskId: true, // ADDED
                name: true,
                status: true,
                description: true,
                tag: true,
                startDate: true,
                days: true,
                isPinned: true,
                assignee: {
                    select: {
                        id: true,
                    },
                },
                parentTask: {
                    select: {
                        projectId: true,
                    },
                },
            },
        });

        if (!subTask) {
            return {
                success: false,
                error: "Subtask not found",
            };
        }

        // 6. Verify subtask belongs to the project
        // CHANGED: Use direct projectId from subTask
        if (subTask.projectId !== projectId) {
            return {
                success: false,
                error: "Subtask does not belong to this project",
            };
        }

        // 7. Check if user is authorized to move this card
        const isAssignee = subTask.assignee?.id === permissions.workspaceMember.userId;
        const isAdminOrLead = permissions.isWorkspaceAdmin || permissions.isProjectLead;

        if (!isAssignee && !isAdminOrLead) {
            return {
                success: false,
                error: "You are not authorized to move this card. Only the assignee, project admin, or project lead can move cards.",
            };
        }

        // 8. Check restricted status transitions
        const restrictedStatuses: TaskStatus[] = ["COMPLETED", "BLOCKED", "HOLD"];
        if (restrictedStatuses.includes(newStatus) && !isAdminOrLead) {
            return {
                success: false,
                error: `You are not authorized to move this card to ${newStatus} status. Only admins and leads can move cards to this status.`,
            };
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

            // Create comprehensive audit log with idempotency support
            const auditLog = await tx.auditLog.create({
                data: {
                    operationId: opId,
                    entityType: "SUBTASK",
                    entityId: subTaskId,
                    action: "MOVE",
                    userId: user.id,
                    workspaceMemberId: permissions.workspaceMemberId,
                    beforeState: {
                        status: subTask.status,
                        name: subTask.name,
                        description: subTask.description,
                        tag: subTask.tag,
                        startDate: subTask.startDate,
                        days: subTask.days,
                        isPinned: subTask.isPinned,
                    },
                    afterState: {
                        status: newStatus,
                        name: subTask.name,
                        description: subTask.description,
                        tag: subTask.tag,
                        startDate: subTask.startDate,
                        days: subTask.days,
                        isPinned: subTask.isPinned,
                    },
                    projectId: projectId,
                    taskId: subTaskId,
                    timestamp: new Date(),
                    ipAddress: ipAddress,
                    userAgent: userAgent,
                },
                select: {
                    id: true,
                    operationId: true,
                    action: true,
                    timestamp: true,
                },
            });

            return { updated, auditLog };
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
            },
            auditLog: {
                id: result.auditLog.id,
                operationId: result.auditLog.operationId,
                action: result.auditLog.action,
                timestamp: result.auditLog.timestamp,
            },
        };
    } catch (error) {
        console.error("Error updating subtask status:", error);
        return {
            success: false,
            error: "An unexpected error occurred while updating the subtask status. Please try again.",
        };
    }
}
