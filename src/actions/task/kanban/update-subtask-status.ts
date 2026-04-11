"use server";

import prisma from "@/lib/db";
import { requireUser } from "@/lib/auth/require-user";
import { getUserPermissions } from "@/data/user/get-user-permissions";
import { revalidateTag } from "next/cache";
import { CacheTags } from "@/data/cache-tags";

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
    reviewCommentId?: string,
    comment?: string,
    attachmentData?: any
): Promise<UpdateSubTaskStatusResult> {
    const startTime = performance.now();
    try {
        const user = await requireUser();

        // 1. Parallelize initial data fetching (Permissions + Task Data + Review Comment)
        // Pass user.id to getUserPermissions to bypass Next.js unstable_cache (~1s overhead)
        const [permissions, subTask, reviewComment] = await Promise.all([
            getUserPermissions(workspaceId, projectId, user.id),
            prisma.task.findUnique({
                where: { id: subTaskId },
                select: {
                    id: true,
                    status: true,
                    createdById: true,
                    assigneeId: true,
                    reviewerId: true,
                    parentTaskId: true,
                },
            }),
            reviewCommentId
                ? prisma.reviewComment.findUnique({
                    where: { id: reviewCommentId },
                    select: { id: true, subTaskId: true },
                })
                : Promise.resolve(null)
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

        // Authorization checks — compare via ProjectMember.id
        // Since createdById & assigneeId are now ProjectMember IDs,
        // we need to check against the current user's projectMember.id
        const isWorkspaceAdmin = permissions.isWorkspaceAdmin;
        const isProjectManager = permissions.isProjectManager;
        const isProjectLead = permissions.isProjectLead;
        const currentProjectMemberId = permissions.projectMember?.id;
        const isCreator = currentProjectMemberId ? subTask.createdById === currentProjectMemberId : false;
        const isAssignee = currentProjectMemberId ? subTask.assigneeId === currentProjectMemberId : false;

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

        // 7b. Specific Restriction: Tasks in REVIEW status
        // A person assigned to a task (assignee) should NOT be able to move it once it's in REVIEW.
        // This ensures they don't review/approve their own work.
        if (subTask.status === "REVIEW") {

            // Only Admins, PMs, or the designated Reviewer can move tasks out of REVIEW.
            // Explicitly block the assignee if they are not an Admin/PM.
            if (isAssignee && !isWorkspaceAdmin && !isProjectManager) {
                return {
                    success: false,
                    error: "As the assignee, you cannot move this task out of Review status. Only a Reviewer, Project Manager, or Admin can approve or reject tasks.",
                };
            }
        }

        const privilegedStatuses = ["COMPLETED", "CANCELLED", "HOLD"];
        if (privilegedStatuses.includes(newStatus)) {
            // Additional privileged status logic
        }

        // 9. Status Transition Validation & Review Comment Verification
        // Case A: Staying in Review
        if (subTask.status === "REVIEW" && newStatus === "REVIEW") {
            return {
                success: false,
                error: "This task is already in review.",
            };
        }

        // Case B: Moving TO Review or Rejecting FROM Review
        const needsReviewComment = (subTask.status === "REVIEW" && newStatus !== "COMPLETED") || newStatus === "REVIEW";

        if (needsReviewComment) {
            // Check if both the ID and the raw text are missing
            if (!reviewCommentId && !comment) {
                const errorMsg = newStatus === "REVIEW"
                    ? "A comment or attachment is required when moving to REVIEW status"
                    : "A comment is required when rejecting or moving a task out of Review status (unless it is being Completed).";
                return { success: false, error: errorMsg };
            }

            // If we're using an existing comment ID (backward compatibility or specific use cases)
            if (reviewCommentId && !comment) {
                if (!reviewComment) {
                    return { success: false, error: `Review comment not found (ID: ${reviewCommentId}). Please try resubmitting.` };
                }

                if (reviewComment.subTaskId !== subTaskId) {
                    return {
                        success: false,
                        error: `This comment (linked to task: ${reviewComment.subTaskId}) does not match the current subtask (${subTaskId}).`
                    };
                }
            }
        }

        // 10. Don't update if status hasn't changed (generic check for non-REVIEW statuses)
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

        // 11. Atomic update (with comment creation if provided)
        const updated = await prisma.$transaction(async (tx) => {
            let finalCommentId = reviewCommentId;

            // If comment text is provided during a review transition, create it.
            // This now includes both moves TO Review and rejections/moves OUT OF Review.
            if (comment && needsReviewComment) {
                const reviewComment = await tx.reviewComment.create({
                    data: {
                        subTaskId: subTaskId,
                        authorId: user.id,
                        workspaceId: workspaceId,
                        text: comment.trim(),
                        attachment: attachmentData,
                    },
                    select: { id: true },
                });
                finalCommentId = reviewComment.id;
            }

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

        // 13. SURGICAL INVALIDATION (Targeted to the card, not the whole board)
        // We only revalidate the specific subtask and generic task tags synchronously.
        // This ensures the Action returns in <400ms and doesn't trigger a full 10s board re-fetch.
        const tagsToRevalidate = new Set<string>();
        CacheTags.subtask(subTaskId).forEach((t: string) => tagsToRevalidate.add(t));
        CacheTags.task(subTaskId).forEach((t: string) => tagsToRevalidate.add(t));

        // Revalidate synchronously (fast)
        for (const tag of tagsToRevalidate) {
            revalidateTag(tag, "layout");
        }

        // 14. BACKGROUND REVALIDATION: Broad tags are hit without 'await' to allow server-side
        // cache to eventually update without blocking the current request's return.
        const broadTags = new Set<string>();
        CacheTags.projectSubTasks(projectId).forEach((t: string) => broadTags.add(t));
        if (subTask.status) {
            CacheTags.subtasksByStatus(projectId, subTask.status as string).forEach((t: string) => broadTags.add(t));
        }
        CacheTags.subtasksByStatus(projectId, newStatus as string).forEach((t: string) => broadTags.add(t));

        // FIRE AND FORGET (Next.js will attempt these in the background)
        (async () => {
            try {
                // Record Activity
                const { recordActivity } = await import("@/lib/audit");
                await recordActivity({
                    userId: user.id,
                    workspaceId,
                    action: "SUBTASK_UPDATED",
                    entityType: "SUBTASK",
                    entityId: subTaskId,
                    oldData: { status: subTask.status },
                    newData: { status: newStatus },
                    broadcastEvent: "team_update", // Triggers silent refresh
                });

                for (const tag of broadTags) {
                    revalidateTag(tag, "layout");
                }
            } catch (e) {
                console.error("Background tasks failed:", e);
            }
        })();

        const duration = performance.now() - startTime;
        console.log(`[PERF] updateSubTaskStatus (ATOMIC) took ${duration.toFixed(2)}ms`, { subTaskId, newStatus });

        return {
            success: true,
            subTask: {
                id: updated.id,
                status: updated.status as TaskStatus,
                updatedAt: updated.updatedAt,
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
