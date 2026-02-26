"use server"

import { getUserPermissions } from "@/data/user/get-user-permissions";
import { invalidateTaskMutation } from "@/lib/cache/invalidation";
import { requireUser } from "@/lib/auth/require-user";
import prisma from "@/lib/db";
import { ApiResponse } from "@/lib/types";
import { SubTaskSchemaType, subTaskSchema } from "@/lib/zodSchemas";
import { syncTaskToProcurement } from "@/lib/procurement/logic";

export async function editSubTask(
    data: SubTaskSchemaType,
    subTaskId: string
): Promise<ApiResponse> {
    try {
        // Parallelize authentication and validation
        const [user, validation] = await Promise.all([
            requireUser(),
            Promise.resolve(subTaskSchema.safeParse(data))
        ]);

        if (!validation.success) {
            return { status: "error", message: "Invalid validation form data" };
        }

        // Optimized query: Get subtask and verify user permissions in one go where possible
        // We need the workspaceId and projectId from the existing subtask to check permissions
        const existingSubTask = await prisma.task.findUnique({
            where: { id: subTaskId },
            include: {
                project: {
                    select: {
                        id: true,
                        workspaceId: true,
                    }
                }
            }
        });

        if (!existingSubTask) {
            return { status: "error", message: "Subtask not found" };
        }

        // Fetch permissions and assignee info in parallel
        const [permissions, assigneeInfo] = await Promise.all([
            getUserPermissions(existingSubTask.project.workspaceId, existingSubTask.project.id),
            validation.data.assignee
                ? prisma.projectMember.findFirst({
                    where: {
                        projectId: validation.data.projectId,
                        OR: [
                            { workspaceMemberId: validation.data.assignee },
                            { workspaceMember: { user: { id: validation.data.assignee } } }
                        ]
                    },
                    select: {
                        workspaceMember: {
                            select: { userId: true }
                        }
                    }
                })
                : Promise.resolve(null)
        ]);

        if (!permissions.workspaceMember) {
            return { status: "error", message: "You are not a member of this workspace" };
        }

        // Permission logic:
        // - Workspace ADMIN: Can edit all subtasks
        // - PROJECT_MANAGER: Can edit all subtasks in their project
        // - LEAD: Can edit only subtasks they created
        const canEditAllTasks = permissions.isWorkspaceAdmin || permissions.isProjectManager;
        const canEditOwnTasks = permissions.isProjectLead && existingSubTask.createdById === user.id;

        if (!canEditAllTasks && !canEditOwnTasks) {
            return {
                status: "error",
                message: permissions.isProjectLead
                    ? "You can only edit subtasks you created"
                    : "You don't have permission to edit this subtask",
            };
        }

        // Perform the update
        await prisma.task.update({
            where: { id: subTaskId },
            data: {
                name: validation.data.name,
                description: validation.data.description,
                assigneeTo: assigneeInfo?.workspaceMember.userId || null,
                tagId: validation.data.tag || null,
                startDate: validation.data.startDate
                    ? (() => {
                        const d = new Date(validation.data.startDate);
                        return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
                    })()
                    : null,
                dueDate: validation.data.startDate && validation.data.days
                    ? (() => {
                        const d = new Date(validation.data.startDate);
                        const utcStart = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
                        const due = new Date(utcStart.getTime());
                        due.setUTCDate(due.getUTCDate() + validation.data.days);
                        return due;
                    })() : null,
                days: validation.data.days,
            },
        });

        // Sync with procurement
        await syncTaskToProcurement(subTaskId);

        // Trigger invalidation without blocking the response if possible, 
        // but for server actions we want to ensure cache is fresh for the re-render.
        // We use the already fetched IDs to avoid extra DB lookups in invalidateTaskMutation
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
