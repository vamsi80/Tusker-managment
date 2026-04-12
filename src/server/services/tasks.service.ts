import "server-only";

import prisma from "@/lib/db";
import { AppError } from "@/lib/errors/app-error";
import { getTaskInvolvedUserIds } from "@/lib/involved-users";
import { recordActivity } from "@/lib/audit";

export type TaskStatus = "TO_DO" | "IN_PROGRESS" | "CANCELLED" | "REVIEW" | "HOLD" | "COMPLETED";

export class TasksService {
    /**
     * Update a subtask status with permission validation and audit logging.
     * Centralized in the service layer for consistency between Hono and Server Actions.
     */
    static async updateSubTaskStatus({
        subTaskId,
        newStatus,
        workspaceId,
        projectId,
        userId,
        permissions,
        comment,
        attachmentData
    }: {
        subTaskId: string;
        newStatus: TaskStatus;
        workspaceId: string;
        projectId: string;
        userId: string;
        permissions: any;
        comment?: string;
        attachmentData?: any;
    }) {
        // 1. Fetch Task Data (Include updatedAt to ensure consistent return types)
        const subTask = await prisma.task.findUnique({
            where: { id: subTaskId },
            select: {
                id: true,
                status: true,
                name: true,
                createdById: true,
                assigneeId: true,
                reviewerId: true,
                parentTaskId: true,
                updatedAt: true,
            },
        });

        if (!subTask) {
            throw AppError.NotFound("Subtask not found");
        }

        // 2. Authorization Checks
        const currentProjectMemberId = permissions.projectMember?.id;
        const isWorkspaceAdmin = permissions.isWorkspaceAdmin;
        const isProjectManager = permissions.isProjectManager;
        const isProjectLead = permissions.isProjectLead;
        
        const isCreator = currentProjectMemberId ? subTask.createdById === currentProjectMemberId : false;
        const isAssignee = currentProjectMemberId ? subTask.assigneeId === currentProjectMemberId : false;

        if (!isWorkspaceAdmin && !isProjectManager) {
            if (isProjectLead) {
                if (!isCreator && !isAssignee) {
                    throw AppError.Forbidden("As a Project Lead, you can only update tasks you created or are assigned to.");
                }
            } else {
                if (!isCreator && !isAssignee) {
                    throw AppError.Forbidden("You can only update tasks that you created or are assigned to.");
                }
            }
        }

        // Specific Restriction: Tasks in REVIEW status
        if (subTask.status === "REVIEW") {
            if (isAssignee && !isWorkspaceAdmin && !isProjectManager) {
                throw AppError.Forbidden("As the assignee, you cannot move this task out of Review status.");
            }
        }

        // 3. Status Transition Validation
        if (subTask.status === newStatus && newStatus !== "REVIEW") {
            return subTask; // No change needed
        }

        const needsReviewComment = (subTask.status === "REVIEW" && newStatus !== "COMPLETED") || newStatus === "REVIEW";
        if (needsReviewComment && !comment && !attachmentData) {
            throw AppError.ValidationError("A comment or attachment is required for this status transition.");
        }

        // 4. Atomic Database Update
        const updated = await prisma.$transaction(async (tx) => {
            // Create review comment if provided
            if (comment && needsReviewComment) {
                await tx.reviewComment.create({
                    data: {
                        subTaskId: subTaskId,
                        authorId: userId,
                        workspaceId: workspaceId,
                        text: comment.trim(),
                        attachment: attachmentData,
                    },
                });
            }

            // Update parent task completed count if needed
            if (subTask.parentTaskId) {
                const wasCompleted = subTask.status === "COMPLETED";
                const isNowCompleted = newStatus === "COMPLETED";

                if (wasCompleted !== isNowCompleted) {
                    await tx.task.update({
                        where: { id: subTask.parentTaskId },
                        data: {
                            completedSubtaskCount: { [isNowCompleted ? "increment" : "decrement"]: 1 }
                        }
                    });
                }
            }

            return await tx.task.update({
                where: { id: subTaskId },
                data: { status: newStatus },
                select: { id: true, status: true, updatedAt: true },
            });
        });

        // 5. Record Activity & Broadcast (Asynchronous)
        try {
            const targetUserIds = await getTaskInvolvedUserIds(subTaskId);
            const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, surname: true } });
            
            await recordActivity({
                userId,
                userName: user?.surname || user?.name || "Someone",
                workspaceId,
                action: "SUBTASK_UPDATED",
                entityType: "SUBTASK",
                entityId: subTaskId,
                oldData: { status: subTask.status, name: subTask.name },
                newData: { status: newStatus },
                broadcastEvent: "team_update",
                targetUserIds, 
            });
        } catch (e) {
            console.error("[SERVICE_ERROR] Failed to record activity:", e);
        }

        return updated;
    }
}
