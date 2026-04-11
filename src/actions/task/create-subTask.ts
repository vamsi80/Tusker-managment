"use server";

import { getUserPermissions } from "@/data/user/get-user-permissions";
import { invalidateTaskMutation } from "@/lib/cache/invalidation";
import { requireUser } from "@/lib/auth/require-user";
import { generateUniqueSlug } from "@/lib/slug-generator";
import prisma from "@/lib/db";
import { ApiResponse } from "@/lib/types";
import { SubTaskSchemaType, subTaskSchema } from "@/lib/zodSchemas";
import { syncTaskToProcurement } from "@/lib/procurement/logic";
import { parseIST } from "@/lib/utils";
import { resolveProjectMemberId } from "@/lib/auth/resolve-member-chain";
import { getTaskInvolvedUserIds } from "@/lib/involved-users";

export async function createSubTask(values: SubTaskSchemaType): Promise<ApiResponse> {
    const user = await requireUser();

    try {
        const validation = subTaskSchema.safeParse(values);
        if (!validation.success) {
            return {
                status: "error",
                message: "Invalid validation form data"
            }
        }

        const project = await prisma.project.findUnique({
            where: { id: values.projectId },
            select: { workspaceId: true, slug: true }
        });

        if (!project) {
            return {
                status: "error",
                message: "Project not found",
            };
        }

        // Get user permissions using cached function
        const permissions = await getUserPermissions(project.workspaceId, values.projectId);

        if (!permissions.workspaceMember) {
            return {
                status: "error",
                message: "You are not a member of this workspace",
            };
        }

        // Check if user has permission to create subtasks (workspace admin or project lead)
        const canSucceed = permissions.isWorkspaceAdmin || permissions.canCreateSubTask;

        if (!canSucceed) {
            return {
                status: "error",
                message: "You don't have permission to create subtasks. Only workspace admins and project leads can create subtasks.",
            };
        }

        // Resolve current user's ProjectMember.id
        let creatorProjectMember = permissions.projectMember;
        
        // 🚀 ADMIN AUTO-PROVISION: If admin/owner is missing from the project, auto-join them
        if (!creatorProjectMember && permissions.isWorkspaceAdmin) {
            try {
                creatorProjectMember = await prisma.projectMember.create({
                    data: {
                        projectId: values.projectId,
                        workspaceMemberId: permissions.workspaceMemberId!,
                        projectRole: "PROJECT_MANAGER", // Admins get Manager rights by default
                        hasAccess: true,
                    }
                }) as any;
            } catch (e) {
                console.error("[ADMIN_AUTO_JOIN_ERROR]", e);
                return {
                    status: "error",
                    message: "Failed to auto-join project. Please contact support.",
                };
            }
        }

        if (!creatorProjectMember) {
            return {
                status: "error",
                message: "You are not a member of this project",
            };
        }

        // Resolve assignee to ProjectMember.id
        let assigneeProjectMemberId: string | null = null;
        if (validation.data.assignee) {
            // The assignee value is a userId — resolve to ProjectMember.id
            assigneeProjectMemberId = await resolveProjectMemberId(
                validation.data.assignee,
                values.projectId,
                project.workspaceId
            );
        }

        // Get parent task to create unique slug
        const parentTask = await prisma.task.findUnique({
            where: { id: validation.data.parentTaskId },
            select: { taskSlug: true }
        });

        if (!parentTask) {
            return {
                status: "error",
                message: "Parent task not found",
            };
        }

        // Default reviewer to creator's ProjectMember.id
        let reviewerProjectMemberId: string | null = null;
        if (validation.data.reviewerId) {
            reviewerProjectMemberId = await resolveProjectMemberId(
                validation.data.reviewerId,
                values.projectId,
                project.workspaceId
            );
        }
        if (!reviewerProjectMemberId) {
            // Default: the creator reviews
            reviewerProjectMemberId = creatorProjectMember.id;
        }

        // Use validated data from schema
        const dueDate = parseIST(validation.data.dueDate);
        const days = validation.data.days;

        // Create unique slug for subtask
        const uniqueSubtaskSlug = await generateUniqueSlug(validation.data.name, 'task', parentTask.taskSlug);

        // Use transaction to ensure counters stay in sync
        let newSubTask;
        try {
            newSubTask = await prisma.$transaction(async (tx) => {
                const task = await tx.task.create({
                    data: {
                        name: validation.data.name,
                        taskSlug: uniqueSubtaskSlug,
                        description: validation.data.description,
                        status: validation.data.status || "TO_DO",
                        projectId: validation.data.projectId,
                        workspaceId: project.workspaceId,
                        parentTaskId: validation.data.parentTaskId,
                        createdById: creatorProjectMember.id,
                        assigneeId: assigneeProjectMemberId,
                        reviewerId: reviewerProjectMemberId,
                        tagId: validation.data.tag || null,
                        startDate: parseIST(validation.data.startDate),
                        dueDate: dueDate,
                        days: days,
                        isParent: false,
                    },
                    include: {
                        assignee: {
                            include: {
                                workspaceMember: {
                                    include: {
                                        user: { select: { id: true, surname: true } }
                                    }
                                }
                            }
                        },
                        tag: { select: { id: true, name: true } },
                        reviewer: {
                            include: {
                                workspaceMember: {
                                    include: {
                                        user: { select: { id: true, surname: true } }
                                    }
                                }
                            }
                        }
                    }
                });

                // Increment parent counters
                await tx.task.update({
                    where: { id: validation.data.parentTaskId },
                    data: {
                        subtaskCount: { increment: 1 },
                        completedSubtaskCount: validation.data.status === "COMPLETED" ? { increment: 1 } : undefined,
                    }
                });

                return task;
            });
        } catch (error: any) {
            console.error("❌ [PRISMA_ERROR] Subtask creation failed:", error);
            if (error.code === 'P2011') {
                console.error("🔍 [PRISMA_META] Null constraint violation details:", error.meta);
            }
            return {
                status: "error",
                message: `Failed to create subtask: ${error.message || "Unknown database error"}`,
            };
        }

        // Sync to procurement
        await syncTaskToProcurement(newSubTask.id);

        // 5. RECORD ACTIVITY & BROADCAST (Structural Pinpoint Sync)
        try {
            const { recordActivity } = await import("@/lib/audit");
            const targetUserIds = await getTaskInvolvedUserIds(newSubTask.id);

            await recordActivity({
                userId: user.id,
                userName: (user as any).surname || user.name || "Someone",
                workspaceId: project.workspaceId,
                action: "SUBTASK_CREATED",
                entityType: "SUBTASK",
                entityId: newSubTask.id,
                newData: {
                    ...newSubTask,
                    projectSlug: project.slug, // Essential context for pinpoint sync
                    _count: { reviewComments: 0 } // Ensures secondary devices render full card stats
                },
                broadcastEvent: "team_update", // Triggers structural sync
                targetUserIds,
            });
        } catch (e) {
            console.error("[PINPOINT_SYNC_ERROR] recordActivity failed:", e);
        }

        return {
            status: "success",
            message: "Subtask created successfully",
            data: newSubTask,
        };

    } catch (err) {
        console.error("Error creating subtask:", err);
        return {
            status: "error",
            message: "We couldn't create the subtask. Please try again.",
        }
    }
}