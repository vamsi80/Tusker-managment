"use server"

import { getUserPermissions } from "@/data/user/get-user-permissions";
import { invalidateTaskMutation } from "@/lib/cache/invalidation";
import { requireUser } from "@/lib/auth/require-user";
import prisma from "@/lib/db";
import { getTaskInvolvedUserIds } from "@/lib/involved-users";
import { ApiResponse } from "@/lib/types";
import { SubTaskSchemaType, subTaskSchema } from "@/lib/zodSchemas";
import { syncTaskToProcurement } from "@/lib/procurement/logic";
import { parseIST } from "@/lib/utils";
import { resolveProjectMemberId } from "@/lib/auth/resolve-member-chain";

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

        // Get subtask and verify
        const existingSubTask = await prisma.task.findUnique({
            where: { id: subTaskId },
            include: {
                project: {
                    select: {
                        id: true,
                        workspaceId: true,
                    }
                },
                // Include the assignee chain to check project role
                assignee: {
                    include: {
                        workspaceMember: {
                            select: { userId: true }
                        }
                    }
                },
                // Include createdBy chain to check creator
                createdBy: {
                    include: {
                        workspaceMember: {
                            select: { userId: true }
                        }
                    }
                }
            }
        });

        if (!existingSubTask) {
            return { status: "error", message: "Subtask not found" };
        }

        // Fetch permissions and resolve assignee in parallel
        const [permissions, assigneeProjectMemberId] = await Promise.all([
            getUserPermissions(existingSubTask.project.workspaceId, existingSubTask.project.id),
            validation.data.assignee
                ? resolveProjectMemberId(
                    validation.data.assignee,
                    validation.data.projectId,
                    existingSubTask.project.workspaceId
                )
                : Promise.resolve(null)
        ]);

        if (!permissions.workspaceMember) {
            return { status: "error", message: "You are not a member of this workspace" };
        }

        // Get assignee's project role for hierarchy enforcement
        let assigneeRole: string | null = null;
        if (existingSubTask.assignee) {
            const assigneePM = await prisma.projectMember.findUnique({
                where: { id: existingSubTask.assigneeId! },
                select: { projectRole: true }
            });
            assigneeRole = assigneePM?.projectRole || "MEMBER";
        }

        const isWorkspaceAdmin = permissions.isWorkspaceAdmin;
        const isProjectManager = permissions.isProjectManager;
        const isProjectLead = permissions.isProjectLead;
        // Check if current user is the creator by comparing User.id through the chain
        const isCreator = existingSubTask.createdBy.workspaceMember.userId === user.id;

        // 1. Hierarchy Rules (Strict)
        if (assigneeRole === "PROJECT_MANAGER") {
            if (!isWorkspaceAdmin) {
                return {
                    status: "error",
                    message: "Only a Workspace Admin can edit tasks assigned to a Project Manager",
                };
            }
        } else if (assigneeRole === "LEAD") {
            if (!isWorkspaceAdmin && !isProjectManager) {
                return {
                    status: "error",
                    message: "Only a Workspace Admin or Project Manager can edit tasks assigned to a Project Lead",
                };
            }
        }

        // 2. Base Permissions
        const canEditAllTasks = isWorkspaceAdmin || isProjectManager;
        const canEditOwnTasks = isProjectLead && isCreator;

        if (!canEditAllTasks && !canEditOwnTasks) {
            return {
                status: "error",
                message: isProjectLead
                    ? "You can only edit subtasks you created"
                    : "You don't have permission to edit this subtask",
            };
        }

        // Resolve reviewer to ProjectMember.id
        let reviewerProjectMemberId: string | null = null;
        if (validation.data.reviewerId) {
            reviewerProjectMemberId = await resolveProjectMemberId(
                validation.data.reviewerId,
                existingSubTask.project.id,
                existingSubTask.project.workspaceId
            );
        }

        const oldData = {
            name: existingSubTask.name,
            description: existingSubTask.description,
            assigneeId: existingSubTask.assigneeId,
            reviewerId: existingSubTask.reviewerId,
            tagId: existingSubTask.tagId,
            startDate: existingSubTask.startDate,
            dueDate: existingSubTask.dueDate,
            days: existingSubTask.days,
        };

        const newData = {
            name: validation.data.name,
            description: validation.data.description,
            assigneeId: assigneeProjectMemberId || null,
            reviewerId: reviewerProjectMemberId || null,
            tagId: validation.data.tag || null,
            startDate: parseIST(validation.data.startDate),
            dueDate: parseIST(validation.data.dueDate),
            days: validation.data.days,
        };

        // Perform the update — all references now use ProjectMember.id
        await prisma.task.update({
            where: { id: subTaskId },
            data: newData,
        });

        // 4. Record Activity (Targeted real-time notifications)
        const { recordActivity } = await import("@/lib/audit");
        const targetUserIds = await getTaskInvolvedUserIds(subTaskId);

        await recordActivity({
            userId: user.id,
            userName: (user as any).surname || user.name || "Someone",

            workspaceId: existingSubTask.project.workspaceId,
            action: "SUBTASK_UPDATED",
            entityType: "SUBTASK",
            entityId: subTaskId,
            oldData,
            newData,
            broadcastEvent: "team_update",
            targetUserIds, // Limit broadcast to involved people
        });

        // Sync with procurement
        await syncTaskToProcurement(subTaskId);

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
