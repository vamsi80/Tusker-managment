"use server";

import prisma from "@/lib/db";
import { requireUser } from "@/app/data/user/require-user";
import { ApiResponse } from "@/lib/types";
import { SubTaskSchemaType, taskSchema, TaskSchemaType, subTaskSchema } from "@/lib/zodSchemas";
import { revalidatePath } from "next/cache";

export async function createTask(values: TaskSchemaType): Promise<ApiResponse> {
    const user = await requireUser();

    try {
        const validation = taskSchema.safeParse(values);
        if (!validation.success) {
            return {
                status: "error",
                message: "Invalid validation form data"
            }
        }

        // 1. Get the project to find the workspaceId
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

        // 2. Verify user is a member of the workspace
        const workspaceMember = await prisma.workspaceMember.findUnique({
            where: {
                userId_workspaceId: {
                    userId: user.id,
                    workspaceId: project.workspaceId,
                },
            },
        });

        if (!workspaceMember) {
            return {
                status: "error",
                message: "You are not a member of this workspace",
            };
        }

        // 3. Create the task
        await prisma.task.create({
            data: {
                name: validation.data.name,
                taskSlug: validation.data.taskSlug,
                projectId: validation.data.projectId,
                createdById: workspaceMember.id,
            },
        });

        // 4. Revalidate cache
        revalidatePath(`/w/${project.workspaceId}/p/${project.slug}/task`);

        return {
            status: "success",
            message: "Task created successfully",
        };

    } catch {
        return {
            status: "error",
            message: "We couldn't create the task. Please try again.",
        }
    }
}

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

        const workspaceMember = await prisma.workspaceMember.findUnique({
            where: {
                userId_workspaceId: {
                    userId: user.id,
                    workspaceId: project.workspaceId,
                },
            },
        });

        if (!workspaceMember) {
            return {
                status: "error",
                message: "You are not a member of this workspace",
            };
        }

        // Check if user has permission to create subtasks (workspace admin or project lead)
        const projectMember = await prisma.projectMember.findFirst({
            where: {
                projectId: values.projectId,
                workspaceMemberId: workspaceMember.id,
            },
        });

        const isWorkspaceAdmin = workspaceMember.workspaceRole === "ADMIN";
        const isProjectLead = projectMember?.projectRole === "LEAD";

        if (!isWorkspaceAdmin && !isProjectLead) {
            return {
                status: "error",
                message: "You don't have permission to create subtasks. Only workspace admins and project leads can create subtasks.",
            };
        }

        let assigneeId: string | null = null;
        if (validation.data.assignee) {
            const assigneeProjectMember = await prisma.projectMember.findFirst({
                where: {
                    projectId: values.projectId,
                    workspaceMember: {
                        userId: validation.data.assignee
                    }
                }
            });
            if (assigneeProjectMember) {
                assigneeId = assigneeProjectMember.id;
            }
        }

        await prisma.task.create({
            data: {
                name: validation.data.name,
                taskSlug: validation.data.taskSlug,
                description: validation.data.description,
                status: validation.data.status,
                projectId: validation.data.projectId,
                parentTaskId: validation.data.parentTaskId,
                createdById: workspaceMember.id,
                assigneeTo: assigneeId,
                tag: validation.data.tag,
                dueDate: validation.data.dueDate ? new Date(validation.data.dueDate) : null,
            },
        });

        revalidatePath(`/w/${project.workspaceId}/p/${project.slug}/task`);

        return {
            status: "success",
            message: "Subtask created successfully",
        };

    } catch (err) {
        console.error("Error creating subtask:", err);
        return {
            status: "error",
            message: "We couldn't create the subtask. Please try again.",
        }
    }
}