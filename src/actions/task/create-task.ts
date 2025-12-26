"use server";
import { getUserPermissions } from "@/data/user/get-user-permissions";
import { invalidateProjectTasks, invalidateWorkspaceTasks } from "@/lib/cache/invalidation";
import prisma from "@/lib/db";
import { ApiResponse } from "@/lib/types";
import { TaskSchemaType, taskSchema } from "@/lib/zodSchemas";
import { revalidatePath } from "next/cache";

export async function createTask(values: TaskSchemaType): Promise<ApiResponse> {
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

        // 2. Verify user is a member of the workspace using cached function
        const permissions = await getUserPermissions(project.workspaceId, values.projectId);

        if (!permissions.workspaceMember) {
            return {
                status: "error",
                message: "You are not a member of this workspace",
            };
        }

        // 3. Create the task
        const newTask = await prisma.task.create({
            data: {
                name: validation.data.name,
                taskSlug: validation.data.taskSlug,
                projectId: validation.data.projectId,
                createdById: permissions.workspaceMember.id,
                tagId: validation.data.tag || null,
            },
            include: {
                _count: {
                    select: { subTasks: true }
                }
            }
        });

        // 4. Revalidate cache (path + task cache + workspace cache)
        revalidatePath(`/w/${project.workspaceId}/p/${project.slug}/task`);
        await invalidateProjectTasks(values.projectId);
        await invalidateWorkspaceTasks(project.workspaceId);

        return {
            status: "success",
            message: "Task created successfully",
            data: newTask,
        };

    } catch {
        return {
            status: "error",
            message: "We couldn't create the task. Please try again.",
        }
    }
}