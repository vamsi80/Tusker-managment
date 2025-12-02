"use server";

import prisma from "@/lib/db";
import { requireUser } from "@/app/data/user/require-user";
import { ApiResponse } from "@/lib/types";
import { taskSchema, TaskSchemaType } from "@/lib/zodSchemas";
import { revalidatePath } from "next/cache";

export async function createTask(values: TaskSchemaType): Promise<ApiResponse> {
    const user = await requireUser();

    const validation = taskSchema.safeParse(values);
    if (!validation.success) {
        return {
            status: "error",
            message: "Please check the form details and try again.",
        };
    }

    try {
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

        // 4. Create the task
        await prisma.task.create({
            data: {
                name: values.name,
                taskSlug: values.taskSlug,
                projectId: values.projectId,
                createdById: workspaceMember.id,
            },
        });

        // 5. Revalidate cache
        revalidatePath(`/w/${project.workspaceId}/p/${project.slug}/task`);

        return {
            status: "success",
            message: "Task created successfully",
        };

    } catch (err) {
        console.error("Error creating task:", err);
        return {
            status: "error",
            message: "We couldn't create the task. Please try again.",
        };
    }
}