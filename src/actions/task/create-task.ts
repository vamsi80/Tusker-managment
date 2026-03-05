"use server";
import { getUserPermissions } from "@/data/user/get-user-permissions";
import { invalidateTaskMutation } from "@/lib/cache/invalidation";
import prisma from "@/lib/db";
import { ApiResponse } from "@/lib/types";
import { TaskSchemaType, taskSchema } from "@/lib/zodSchemas";
import { syncTaskToProcurement } from "@/lib/procurement/logic";

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

        // Check if user has permission to create tasks (workspace admin or project lead)
        if (!permissions.canCreateSubTask) {
            return {
                status: "error",
                message: "You don't have permission to create tasks. Only workspace admins and project leads can create tasks.",
            };
        }

        // Generate unique slug using optimized generator
        const slug = await (import("@/lib/slug-generator").then(m => m.generateUniqueSlug(
            validation.data.name,
            "task"
        )));

        // For parent tasks, the default reviewer should be null if not provided
        const reviewerId = validation.data.reviewerId ?? null;

        // 3. Create the task
        const newTask = await prisma.task.create({
            data: {
                name: validation.data.name,
                taskSlug: slug,
                projectId: validation.data.projectId,
                workspaceId: project.workspaceId,
                createdById: permissions.workspaceMember.userId,
                reviewerId: reviewerId,
            },
            include: {
                _count: {
                    select: { subTasks: true }
                },
                reviewer: {
                    select: {
                        id: true,
                        // name: true,
                        surname: true,
                        // image: true,
                    }
                }
            }
        });

        // Sync to procurement
        await syncTaskToProcurement(newTask.id);

        // 4. OPTIMIZED: Use comprehensive cache invalidation
        // Removed revalidatePath (slow) - using invalidateTaskMutation instead
        await invalidateTaskMutation({
            taskId: newTask.id,
            projectId: values.projectId,
            workspaceId: project.workspaceId,
            userId: permissions.workspaceMember.userId
        });

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
