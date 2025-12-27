"use server";

import prisma from "@/lib/db";
import { requireUser } from "@/lib/auth/require-user";
import { getUserPermissions } from "@/data/user/get-user-permissions";
import { headers } from "next/headers";
import {
    invalidateTaskMutation,
    invalidateProjectSubTasks
} from "@/lib/cache/invalidation";

interface PinSubTaskResult {
    success: boolean;
    error?: string;
    subTask?: {
        id: string;
        isPinned: boolean;
        pinnedAt: Date | null;
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
 * Pin or unpin a subtask in the Kanban board
 * 
 * Permission Rules:
 * - Only project admin or project lead can pin/unpin cards
 * - Pinned cards appear at the top of their column
 * - All pin/unpin actions are logged for audit trail
 * 
 * @param subTaskId - ID of the subtask to pin/unpin
 * @param isPinned - Whether to pin (true) or unpin (false)
 * @param operationId - Unique operation ID for idempotency
 * @param workspaceId - Workspace ID for permission check
 * @param projectId - Project ID for permission check
 */
export async function pinSubTask(
    subTaskId: string,
    isPinned: boolean,
    operationId: string,
    workspaceId: string,
    projectId: string
): Promise<PinSubTaskResult> {
    try {
        // 1. Authenticate user
        const user = await requireUser();

        // 2. Get user permissions
        const permissions = await getUserPermissions(workspaceId, projectId);

        if (!permissions.workspaceMemberId) {
            return {
                success: false,
                error: "You do not have access to this project",
            };
        }

        // 3. Check if user is authorized to pin/unpin (only admin or lead)
        const isAdminOrLead = permissions.isWorkspaceAdmin || permissions.isProjectLead;

        if (!isAdminOrLead) {
            return {
                success: false,
                error: "You are not authorized to pin/unpin cards. Only project admins and leads can pin cards.",
            };
        }

        // 4. Check for duplicate operation (idempotency)
        const existingAuditLog = await prisma.auditLog.findUnique({
            where: { operationId },
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
                    isPinned: afterState.isPinned,
                    pinnedAt: afterState.pinnedAt ? new Date(afterState.pinnedAt) : null,
                    updatedAt: existingAuditLog.timestamp,
                },
                auditLog: {
                    id: existingAuditLog.id,
                    operationId: operationId,
                    action: existingAuditLog.action,
                    timestamp: existingAuditLog.timestamp,
                },
            };
        }

        // 5. Fetch the subtask with current state
        const subTask = await prisma.task.findUnique({
            where: { id: subTaskId },
            select: {
                id: true,
                isPinned: true,
                pinnedAt: true,
                pinnedBy: true,
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
        if (subTask.parentTask?.projectId !== projectId) {
            return {
                success: false,
                error: "Subtask does not belong to this project",
            };
        }

        // 7. Don't update if pin state hasn't changed
        if (subTask.isPinned === isPinned) {
            return {
                success: true,
                subTask: {
                    id: subTask.id,
                    isPinned: subTask.isPinned,
                    pinnedAt: subTask.pinnedAt,
                    updatedAt: new Date(),
                },
            };
        }

        // 8. Get request metadata
        const headersList = await headers();
        const ipAddress = headersList.get("x-forwarded-for") || headersList.get("x-real-ip") || "unknown";
        const userAgent = headersList.get("user-agent") || "unknown";

        // 9. Update subtask and create audit log in a transaction
        const result = await prisma.$transaction(async (tx) => {
            // Update the subtask
            const updated = await tx.task.update({
                where: { id: subTaskId },
                data: {
                    isPinned: isPinned,
                    pinnedAt: isPinned ? new Date() : null,
                    pinnedBy: isPinned ? user.id : null,
                },
                select: {
                    id: true,
                    isPinned: true,
                    pinnedAt: true,
                    updatedAt: true,
                },
            });

            // Create audit log
            const auditLog = await tx.auditLog.create({
                data: {
                    operationId: operationId,
                    entityType: "SUBTASK",
                    entityId: subTaskId,
                    action: isPinned ? "PIN" : "UNPIN",
                    userId: user.id,
                    workspaceMemberId: permissions.workspaceMemberId,
                    beforeState: {
                        isPinned: subTask.isPinned,
                        pinnedAt: subTask.pinnedAt,
                        pinnedBy: subTask.pinnedBy,
                    },
                    afterState: {
                        isPinned: updated.isPinned,
                        pinnedAt: updated.pinnedAt,
                        pinnedBy: isPinned ? user.id : null,
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

        // 10. OPTIMIZED: Use comprehensive cache invalidation
        // Invalidates subtask, project tasks, workspace tasks, and Kanban view
        await invalidateTaskMutation({
            taskId: subTaskId,
            projectId: projectId,
            workspaceId: workspaceId,
            userId: user.id
        });

        // Also invalidate project subtasks for Kanban view
        await invalidateProjectSubTasks(projectId);

        return {
            success: true,
            subTask: {
                id: result.updated.id,
                isPinned: result.updated.isPinned,
                pinnedAt: result.updated.pinnedAt,
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
        console.error("Error pinning/unpinning subtask:", error);
        return {
            success: false,
            error: "An unexpected error occurred while pinning/unpinning the subtask. Please try again.",
        };
    }
}

/**
 * Generate a unique operation ID for idempotency
 * Format: {action}-{entityId}-{timestamp}-{random}
 */
export function generateOperationId(action: string, entityId: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9);
    return `${action}-${entityId}-${timestamp}-${random}`;
}
