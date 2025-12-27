"use server"

import { getUserPermissions } from "@/data/user/get-user-permissions";
import { invalidateTaskMutation } from "@/lib/cache/invalidation";
import { requireUser } from "@/lib/auth/require-user";
import prisma from "@/lib/db";
import { ApiResponse } from "@/lib/types";
import { SubTaskSchemaType, subTaskSchema } from "@/lib/zodSchemas";

export async function editSubTask(
    data: SubTaskSchemaType,
    subTaskId: string
): Promise<ApiResponse> {
    try {
        // Authenticate user
        const user = await requireUser();

        // Validate the input data
        const validation = subTaskSchema.safeParse(data);
        if (!validation.success) {
            return {
                status: "error",
                message: "Invalid validation form data"
            }
        }

        // Get the subtask with project and workspace info
        const existingSubTask = await prisma.task.findUnique({
            where: { id: subTaskId },
            include: {
                project: {
                    select: {
                        id: true,
                        workspaceId: true,
                        slug: true,
                    }
                }
            }
        });

        if (!existingSubTask) {
            return {
                status: "error",
                message: "Subtask not found",
            };
        }

        // Check permissions
        const permissions = await getUserPermissions(
            existingSubTask.project.workspaceId,
            existingSubTask.project.id
        );

        if (!permissions.workspaceMember) {
            return {
                status: "error",
                message: "You are not a member of this workspace",
            };
        }

        // Get assignee ID if provided
        let assigneeId: string | null = null;
        if (validation.data.assignee) {
            const assignee = await prisma.projectMember.findFirst({
                where: {
                    projectId: validation.data.projectId,
                    workspaceMember: {
                        user: {
                            id: validation.data.assignee
                        }
                    }
                },
                select: { id: true }
            });

            if (assignee) {
                assigneeId = assignee.id;
            }
        }

        await prisma.task.update({
            where: { id: subTaskId },
            data: {
                name: validation.data.name,
                description: validation.data.description,
                assigneeTo: assigneeId,
                tagId: validation.data.tag || null,
                startDate: validation.data.startDate ? new Date(validation.data.startDate) : null,
                days: validation.data.days,
            },
        });

        // OPTIMIZED: Use comprehensive cache invalidation
        await invalidateTaskMutation({
            taskId: subTaskId,
            projectId: existingSubTask.projectId,
            workspaceId: existingSubTask.project.workspaceId,
            userId: user.id,
            parentTaskId: existingSubTask.parentTaskId || undefined
        });

        return {
            status: "success",
            message: "Subtask updated successfully",
        };

    } catch (err) {
        console.error("Error updating subtask:", err);
        return {
            status: "error",
            message: "We couldn't update the subtask. Please try again.",
        }
    }
}