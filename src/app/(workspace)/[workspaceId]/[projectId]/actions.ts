"use server";

import prisma from "@/lib/db"; // use the shared client
import { ApiResponse } from "@/lib/types";
import { taskSchema, TaskSchemaType } from "@/lib/zodSchemas";
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
            await requireWorkspaceAdmin(project.workspaceId, user.id);
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
