"use server";
import { getUserPermissions } from "@/data/user/get-user-permissions";
import { invalidateTaskMutation } from "@/lib/cache/invalidation";
import prisma from "@/lib/db";
import { ApiResponse } from "@/lib/types";
import { TaskSchemaType, taskSchema } from "@/lib/zodSchemas";
import { syncTaskToProcurement } from "@/lib/procurement/logic";
import { resolveProjectMemberId } from "@/lib/auth/resolve-member-chain";

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

        // Resolve current user's ProjectMember.id
        const projectMember = permissions.projectMember;
        if (!projectMember) {
            return {
                status: "error",
                message: "You are not a member of this project",
            };
        }

        // Generate unique slug using optimized generator
        const slug = await (import("@/lib/slug-generator").then(m => m.generateUniqueSlug(
            validation.data.name,
            "task"
        )));

        // Resolve reviewerId to ProjectMember.id if provided
        let reviewerPMId: string | null = null;
        if (validation.data.reviewerId) {
            reviewerPMId = await resolveProjectMemberId(
                validation.data.reviewerId,
                values.projectId,
                project.workspaceId
            );
        }

        // 3. Create the task — createdById and reviewerId are now ProjectMember IDs
        const newTask = await prisma.task.create({
            data: {
                name: validation.data.name,
                taskSlug: slug,
                projectId: validation.data.projectId,
                workspaceId: project.workspaceId,
                createdById: projectMember.id,
                reviewerId: reviewerPMId,
            },
            include: {
                _count: {
                    select: { subTasks: true }
                },
            }
        });

        // Sync to procurement
        await syncTaskToProcurement(newTask.id);

        // 4. OPTIMIZED: Use comprehensive cache invalidation
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
