"use server";

import { getUserPermissions } from "@/data/user/get-user-permissions";
import { invalidateTaskMutation } from "@/lib/cache/invalidation";
import { requireUser } from "@/lib/auth/require-user";
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
        if (validation.data.assignee) {
            // The assignee value is the workspaceMemberId, find the corresponding projectMember
            const assigneeProjectMember = await prisma.projectMember.findFirst({
                where: {
                    projectId: values.projectId,
                    OR: [
                        { workspaceMemberId: validation.data.assignee },
                        { workspaceMember: { user: { id: validation.data.assignee } } }
                    ]
                }
            });
            if (assigneeProjectMember) {
                assigneeId = assigneeProjectMember.id;
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

        // Create unique slug for subtask by combining parent slug with subtask slug
        const uniqueSubtaskSlug = `${parentTask.taskSlug}-${validation.data.taskSlug}`;

        const newSubTask = await prisma.task.create({
            data: {
                name: validation.data.name,
                taskSlug: uniqueSubtaskSlug, // Use unique slug
                description: validation.data.description,
                status: validation.data.status,
                projectId: validation.data.projectId,
                parentTaskId: validation.data.parentTaskId,
                createdById: permissions.workspaceMember.id,
                assigneeTo: assigneeId,
                tagId: validation.data.tag || null,
                startDate: validation.data.startDate ? new Date(validation.data.startDate) : null,
                days: validation.data.days,
            },
            include: {
                assignee: {
                    include: {
                        workspaceMember: {
                            include: {
                                user: {
                                    select: {
                                        id: true,
                                        name: true,
                                        surname: true,
                                        image: true,
                                    }
                                }
                            }
                        }
                    }
                },
                tag: {
                    select: {
                        id: true,
                        name: true,
                    }
                }
            }
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