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
        const canSucceed = permissions.isWorkspaceAdmin || permissions.canCreateSubTask;
        
        if (!canSucceed) {
            return {
                status: "error",
                message: "You don't have permission to create tasks. Only workspace admins and project leads can create tasks.",
            };
        }

        // Resolve current user's ProjectMember.id
        let projectMember = permissions.projectMember;

        // 🚀 ADMIN AUTO-PROVISION: If admin/owner is missing from the project, auto-join them
        if (!projectMember && permissions.isWorkspaceAdmin) {
            try {
                projectMember = await prisma.projectMember.create({
                    data: {
                        projectId: values.projectId,
                        workspaceMemberId: permissions.workspaceMemberId!,
                        projectRole: "PROJECT_MANAGER", // Admins get Manager rights by default
                        hasAccess: true,
                    }
                }) as any;
            } catch (e) {
                console.error("[ADMIN_AUTO_JOIN_ERROR]", e);
                return {
                    status: "error",
                    message: "Failed to auto-join project. Please contact support.",
                };
            }
        }

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
                assignee: true,
                tag: true,
                reviewer: true,
                _count: {
                    select: { subTasks: true }
                },
            }
        });

        // Sync to procurement
        await syncTaskToProcurement(newTask.id);

        // 4. RECORD ACTIVITY & BROADCAST (Structural Pinpoint Sync)
        try {
            const { recordActivity } = await import("@/lib/audit");
            const { getTaskInvolvedUserIds } = await import("@/lib/involved-users");
            const targetUserIds = await getTaskInvolvedUserIds(newTask.id);
            
            await recordActivity({
                userId: permissions.workspaceMember.userId,
                userName: (permissions.workspaceMember as any).surname || (permissions.workspaceMember as any).name || "Someone",
                workspaceId: project.workspaceId,
                action: "TASK_CREATED",
                entityType: "TASK",
                entityId: newTask.id,
                newData: {
                    ...newTask,
                    projectSlug: project.slug,
                    _count: { ...newTask._count, reviewComments: 0 } // Ensure full stats for zero-weight rendering
                },
                broadcastEvent: "team_update", // Triggers structural sync
                targetUserIds, 
            });
        } catch (e) {
            console.error("[PINPOINT_SYNC_ERROR] recordActivity failed:", e);
        }

        return {
            status: "success",
            message: "Task created successfully",
            data: newTask,
        };

    } catch (err) {
        console.error("[CREATE_TASK_ERROR]", err);
        return {
            status: "error",
            message: "We couldn't create the task. Please try again.",
        }
    }
}
