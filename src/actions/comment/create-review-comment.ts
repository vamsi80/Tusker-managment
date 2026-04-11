"use server";

import prisma from "@/lib/db";
import { requireUser } from "@/lib/auth/require-user";
import { getUserPermissions } from "@/data/user/get-user-permissions";
import { invalidateReviewComments, invalidateProjectTasks } from "@/lib/cache/invalidation";
import { getTaskInvolvedUserIds } from "@/lib/involved-users";

export interface CreateReviewCommentResult {
    success: boolean;
    error?: string;
    reviewCommentId?: string;
}

/**
 * Server action to create a review comment for a subtask when moving to REVIEW status
 * 
 * @param subTaskId - ID of the subtask
 * @param text - Comment text
 * @param workspaceId - Workspace ID for permission check
 * @param projectId - Project ID for permission check
 * @param attachmentData - Optional attachment data (base64 encoded)
 */
export async function createReviewCommentAction(
    subTaskId: string,
    text: string,
    workspaceId: string,
    projectId: string,
    attachmentData?: {
        fileName: string;
        fileType: string;
        fileSize: number;
        base64Data: string;
    },
    previousStatus?: string,
    targetStatus?: string
): Promise<CreateReviewCommentResult> {
    try {
        // 1. Start parallel fetch
        const authStart = performance.now();
        const user = await requireUser();

        const [permissions, subTask] = await Promise.all([
            getUserPermissions(workspaceId, projectId, user.id),
            prisma.task.findUnique({
                where: { id: subTaskId },
                select: {
                    id: true,
                    projectId: true, // Direct project lookup to avoid nested parent lookup
                },
            })
        ]);

        if (!permissions.workspaceMemberId) {
            return {
                success: false,
                error: "You do not have access to this project",
            };
        }

        if (!subTask) {
            return {
                success: false,
                error: "Subtask not found",
            };
        }

        if (subTask.projectId !== projectId) {
            return {
                success: false,
                error: "Subtask does not belong to this project",
            };
        }

        // 4. Validate input
        if (!text.trim() && !attachmentData) {
            return {
                success: false,
                error: "Comment text or attachment is required",
            };
        }

        let attachmentJson: any = null;
        if (attachmentData || previousStatus || targetStatus) {
            attachmentJson = {
                ...(attachmentData ? {
                    fileName: attachmentData.fileName,
                    fileType: attachmentData.fileType,
                    fileSize: attachmentData.fileSize,
                    data: attachmentData.base64Data,
                    uploadedAt: new Date().toISOString(),
                } : {}),
                ...(previousStatus ? { previousStatus } : {}),
                ...(targetStatus ? { targetStatus } : {}),
            };
        }

        // 6. Create review comment
        const reviewComment = await prisma.reviewComment.create({
            data: {
                subTaskId: subTaskId,
                authorId: user.id,
                workspaceId: workspaceId,
                text: text.trim() || "(No comment - attachment only)",
                attachment: attachmentJson as any,
            },
            select: {
                id: true,
            },
        });

        // 6.5 Record Activity (Targeted real-time notifications)
        const { recordActivity } = await import("@/lib/audit");
        const targetUserIds = await getTaskInvolvedUserIds(subTaskId);
        
        await recordActivity({
            userId: user.id,
            userName: (user as any).surname || user.name || "Someone",
            workspaceId: workspaceId,
            action: "COMMENT_CREATED",
            entityType: "SUBTASK",
            entityId: subTaskId,
            newData: { 
                id: reviewComment.id,
                text: text.trim(),
                createdAt: new Date().toISOString()
            },
            broadcastEvent: "team_update", // Triggers surgical client-side sync
            targetUserIds, 
        });

        return {
            success: true,
            reviewCommentId: reviewComment.id,
        };
    } catch (error) {
        console.error("Error creating review comment:", error);
        return {
            success: false,
            error: "An unexpected error occurred while creating the review comment",
        };
    }
}
