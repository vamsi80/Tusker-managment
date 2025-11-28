"use server";

import prisma from "@/lib/db"; // use the shared client
import { ApiResponse } from "@/lib/types";
import { subTaskSchema, SubTaskSchemaType, taskSchema, TaskSchemaType } from "@/lib/zodSchemas";
import { requireUser } from "@/app/data/user/require-user";
import { requireWorkspaceAdmin } from "@/utils/workspaceAdmin";

export async function createTask(values: TaskSchemaType): Promise<ApiResponse> {

    const user = await requireUser();

    if (!user) {
        return {
            status: "error",
            message: "User not authenticated"
        };
    }

    try {
        const result = taskSchema.safeParse(values);

        if (!result.success) {
            return {
                status: "error",
                message: "Invalid validation data"
            }
        }

        if (!values?.projectId) {
            return {
                status: "error",
                message: "Invalid workspace id"
            };
        }

        const project = await prisma.project.findUnique({
            where: {
                id: values.projectId
            },
            include: {
                workspace: true,
            }
        });

        if (!project) {
            return {
                status: "error",
                message: "Invalid project Id"
            };
        }

        try {
            await requireWorkspaceAdmin(project.workspaceId);
        } catch (err: any) {
            return { status: "error", message: err.message ?? "Access denied" };
        }

        const workspaceId = project.workspace.id;

        if (!workspaceId) {
            return {
                status: "error",
                message: "Project is not linked to a workspace"
            };
        }

        const workspaceMember = await prisma.workspaceMember.findUnique({
            where: {
                userId_workspaceId: {
                    userId: user.id,
                    workspaceId,
                },
            },
        });

        if (!workspaceMember) {
            return {
                status: "error",
                message: "You are not a member of the workspace that owns this project"
            };
        }

        await prisma.task.create({
            data: {
                ...result.data,
                name: result.data.name,
                projectId: result.data.projectId
            },
        });

        return {
            status: "success",
            message: "Task created successfully"
        }
    } catch {
        return {
            status: "error",
            message: "Failed to create Task"
        }
    }
}

export async function createSubTask(values: SubTaskSchemaType, workspaceId: string): Promise<ApiResponse> {

    const admin = await requireWorkspaceAdmin(workspaceId);

    if (!admin) {
        return {
            status: "error",
            message: "You are not a member of the workspace that owns this project"
        }
    }

    try {
        const result = subTaskSchema.safeParse(values);

        if (!result.success) {
            return {
                status: "error",
                message: "Invalid validation data"
            }
        }

        await prisma.$transaction(async (tx) => {
            const maxPos = await tx.subTask.findFirst({
                where: {
                    taskId: result.data.taskId,
                },
                select: {
                    position: true,
                },
                orderBy: {
                    position: "desc",
                },
            });

            await tx.subTask.create({
                data: {
                    name: result.data.name,
                    taskId: result.data.taskId,
                    description: result.data.description,
                    dueDate: result.data.dueDate,
                    startDate: new Date(result.data.startDate),
                    status: result.data.status,
                    priority: result.data.priority,
                    assignee: result.data.assignee,
                    position: (maxPos?.position ?? 0) + 1,
                },
            });
        });

        return {
            status: "success",
            message: "Task deleted successfully"
        }
    } catch {
        return {
            status: "error",
            message: "Failed to delete Task"
        }
    }
}
