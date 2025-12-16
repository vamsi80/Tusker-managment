"use server";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/auth/require-user";
import { getUserPermissions } from "@/data/user/get-user-permissions";
import { invalidateReviewComments, invalidateProjectTasks } from "@/lib/cache/invalidation";

interface CreateReviewCommentResult {
    success: boolean;
    error?: string;
    reviewCommentId?: string;
}

/**
 * Create a review comment for a subtask when moving to REVIEW status
 * 
 * @param subTaskId - ID of the subtask
 * @param text - Comment text
 * @param workspaceId - Workspace ID for permission check
 * @param projectId - Project ID for permission check
 * @param attachmentData - Optional attachment data (base64 encoded)
 */
export async function createReviewComment(
    subTaskId: string,
    text: string,
    workspaceId: string,
    projectId: string,
    attachmentData?: {
        fileName: string;
        fileType: string;
        fileSize: number;
        base64Data: string;
    }
): Promise<CreateReviewCommentResult> {
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

        // 3. Verify subtask exists and belongs to the project
        const subTask = await prisma.task.findUnique({
            where: { id: subTaskId },
            select: {
                id: true,
                parentTask: {
                    select: {
                        projectId: true,
                        project: {
                            select: {
                                slug: true
                            }
                        }
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

        if (subTask.parentTask?.projectId !== projectId) {
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

        // 5. Prepare attachment JSON if provided
        let attachmentJson: any = null;
        if (attachmentData) {
            attachmentJson = {
                fileName: attachmentData.fileName,
                fileType: attachmentData.fileType,
                fileSize: attachmentData.fileSize,
                data: attachmentData.base64Data,
                uploadedAt: new Date().toISOString(),
            };
        }

        // 6. Create review comment
        const reviewComment = await prisma.reviewComment.create({
            data: {
                subTaskId: subTaskId,
                authorId: permissions.workspaceMemberId,
                text: text.trim() || "(No comment - attachment only)",
                attachment: attachmentJson as any,
            },
            select: {
                id: true,
            },
        });

        // 7. Invalidate caches using cache tags (faster than revalidatePath)
        await invalidateReviewComments(subTaskId);
        await invalidateProjectTasks(projectId);

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
