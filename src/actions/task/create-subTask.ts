"use server";

import { getUserPermissions } from "@/data/user/get-user-permissions";
import { invalidateTaskMutation } from "@/lib/cache/invalidation";
import { requireUser } from "@/lib/auth/require-user";
import { generateUniqueSlug } from "@/lib/slug-generator";
import prisma from "@/lib/db";
import { ApiResponse } from "@/lib/types";
import { SubTaskSchemaType, subTaskSchema } from "@/lib/zodSchemas";
import { syncTaskToProcurement } from "@/lib/procurement/logic";

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
        if (!permissions.canCreateSubTask) {
            return {
                status: "error",
                message: "You don't have permission to create subtasks. Only workspace admins and project leads can create subtasks.",
            };
        }

        let assigneeId: string | null = null;
        let assigneeDisplayName: string | null = null;
        if (validation.data.assignee) {
            // The assignee value is the workspaceMemberId, find the corresponding projectMember's user ID
            const assigneeProjectMember = await prisma.projectMember.findFirst({
                where: {
                    projectId: values.projectId,
                    OR: [
                        { workspaceMemberId: validation.data.assignee },
                        { workspaceMember: { user: { id: validation.data.assignee } } }
                    ]
                },
                include: {
                    workspaceMember: {
                        include: {
                            user: {
                                select: { surname: true, name: true }
                            }
                        }
                    }
                }
            });
            if (assigneeProjectMember) {
                assigneeId = assigneeProjectMember.workspaceMember.userId;
                assigneeDisplayName = assigneeProjectMember.workspaceMember.user.surname || assigneeProjectMember.workspaceMember.user.name;
            }
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

        // Default reviewer to creator
        const providedReviewerId = validation.data.reviewerId || null;
        const reviewerId = providedReviewerId ?? permissions.workspaceMember.userId;

        // Calculate dueDate and days (UTC safe)
        let dueDate: Date | null = null;
        let days: number | null = null;
        
        if (validation.data.dueDate) {
            const d = new Date(validation.data.dueDate);
            dueDate = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
            
            if (validation.data.startDate) {
                const s = new Date(validation.data.startDate);
                const utcStart = new Date(Date.UTC(s.getFullYear(), s.getMonth(), s.getDate()));
                const diffTime = Math.abs(dueDate.getTime() - utcStart.getTime());
                days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            }
        }

        // Create unique slug for subtask using helper to prevent collisions
        // We use validation.data.name because generateUniqueSlug slugifies it internally
        const uniqueSubtaskSlug = await generateUniqueSlug(validation.data.name, 'task', parentTask.taskSlug);

        // Fetch reviewer name if present
        let reviewerDisplayName: string | null = null;
        if (reviewerId) {
            const revMember = await prisma.user.findUnique({
                where: { id: reviewerId },
                select: { surname: true }
            });
            reviewerDisplayName = revMember ? (revMember.surname) : null;
        }

        // Use transaction to ensure counters and display names stay in sync
        const newSubTask = await prisma.$transaction(async (tx) => {
            const task = await tx.task.create({
                data: {
                    name: validation.data.name,
                    taskSlug: uniqueSubtaskSlug,
                    description: validation.data.description,
                    status: validation.data.status,
                    projectId: validation.data.projectId,
                    workspaceId: project.workspaceId,
                    parentTaskId: validation.data.parentTaskId,
                    createdById: permissions.workspaceMember!.userId,
                    assigneeTo: assigneeId,
                    assigneeDisplayName: assigneeDisplayName,
                    reviewerId: reviewerId,
                    reviewerDisplayName: reviewerDisplayName,
                    tagId: validation.data.tag || null,
                    startDate: validation.data.startDate
                        ? (() => {
                            const d = new Date(validation.data.startDate);
                            return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
                        })()
                        : null,
                    dueDate: dueDate,
                    days: days,
                    isParent: false,
                },
                include: {
                    assignee: { select: { id: true, surname: true } },
                    tag: { select: { id: true, name: true } },
                    reviewer: { select: { id: true, surname: true } }
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

        // Sync to procurement
        await syncTaskToProcurement(newSubTask.id);

        // OPTIMIZED: Use comprehensive cache invalidation
        await invalidateTaskMutation({
            taskId: newSubTask.id,
            projectId: values.projectId,
            workspaceId: project.workspaceId,
            userId: user.id,
            parentTaskId: values.parentTaskId
        });

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