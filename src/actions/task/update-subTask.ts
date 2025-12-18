"use server"

import { getUserPermissions } from "@/data/user/get-user-permissions";
import { invalidateTaskSubTasks, invalidateProjectTasks, invalidateWorkspaceTasks } from "@/lib/cache/invalidation";
import prisma from "@/lib/db";
import { ApiResponse } from "@/lib/types";
import { SubTaskSchemaType, subTaskSchema } from "@/lib/zodSchemas";
import { revalidatePath } from "next/cache";

export async function editSubTask(
    data: SubTaskSchemaType,
    subTaskId: string
): Promise<ApiResponse> {
    try {
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

        // Update the subtask
        await prisma.task.update({
            where: { id: subTaskId },
            data: {
                name: validation.data.name,
                description: validation.data.description,
                assigneeTo: assigneeId,
                tag: validation.data.tag,
                startDate: validation.data.startDate ? new Date(validation.data.startDate) : null,
                days: validation.data.days,
            },
        });

        // Revalidate cache (path + subtask cache + workspace cache)
        revalidatePath(`/w/${existingSubTask.project.workspaceId}/p/${existingSubTask.project.slug}/task`);
        if (existingSubTask.parentTaskId) {
            await invalidateTaskSubTasks(existingSubTask.parentTaskId);
        }
        await invalidateProjectTasks(existingSubTask.projectId);
        await invalidateWorkspaceTasks(existingSubTask.project.workspaceId);

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