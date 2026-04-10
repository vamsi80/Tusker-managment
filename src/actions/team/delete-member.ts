"use server";

import prisma from "@/lib/db";
import { auth } from "@/lib/auth";
import { broadcastTeamUpdate } from "@/lib/realtime";
import { getWorkspaceById } from "@/data/workspace/get-workspace-by-id";
import { ApiResponse } from "@/lib/types";
import { revalidatePath } from "next/cache";

/**
 * Shared logic to delete a workspace member.
 * Used by both Server Actions and API Route Handlers.
 */
export async function deleteMemberAction(
    workspaceMemberId: string,
    workspaceId: string,
    currentUserId: string
): Promise<ApiResponse> {
    try {
        const workspace = await getWorkspaceById(workspaceId);

        if (!workspace) {
            return { status: "error", message: "Workspace not found." };
        }

        if (!workspace.members || workspace.members.length === 0) {
            return { status: "error", message: "Workspace has no members." };
        }

        const currentMember = workspace.members.find((m) => m.userId === currentUserId);
        if (!currentMember || (currentMember.workspaceRole !== "OWNER" && currentMember.workspaceRole !== "ADMIN")) {
            return { status: "error", message: "Only workspace owners/admins can remove members." };
        }

        const memberToDelete = workspace.members.find((m) => m.id === workspaceMemberId);
        if (!memberToDelete) {
            return { status: "error", message: "Member not found in this workspace." };
        }

        if (memberToDelete.userId === currentUserId) {
            return { status: "error", message: "You cannot remove yourself from the workspace." };
        }

        if (memberToDelete.userId === workspace.ownerId) {
            return { status: "error", message: "Cannot remove the workspace owner. Transfer ownership first." };
        }

        const adminCount = workspace.members.filter((m) => m.workspaceRole === "ADMIN").length;
        if (memberToDelete.workspaceRole === "ADMIN" && adminCount <= 1) {
            return { status: "error", message: "Cannot remove the last admin from the workspace." };
        }

        const userIdToDelete = memberToDelete.userId;
        const userName = memberToDelete.user?.name || "User";

        const ownedWorkspaces = await prisma.workspace.count({
            where: {
                ownerId: userIdToDelete,
                id: { not: workspaceId },
            },
        });

        if (ownedWorkspaces > 0) {
            return {
                status: "error",
                message: `Cannot delete user "${userName}" because they own other workspaces. Please transfer ownership first.`,
            };
        }

        await prisma.$transaction(async (tx) => {
            await tx.workspaceMember.deleteMany({
                where: { userId: userIdToDelete },
            });
            await tx.user.delete({
                where: { id: userIdToDelete },
            });
        });

        // Delete from Better Auth
        try {
            if ((auth.api as any).deleteUser) {
                await (auth.api as any).deleteUser({ userId: userIdToDelete });
            } else if ((auth.api as any).admin?.deleteUser) {
                await (auth.api as any).admin.deleteUser({ userId: userIdToDelete });
            }
        } catch (authDeleteErr) {
            console.error("Failed to delete auth user:", authDeleteErr);
        }

        // Invalidate caches
        const { invalidateUserWorkspaces, invalidateWorkspaceMembers } = await import('@/lib/cache/invalidation');
        await invalidateUserWorkspaces(userIdToDelete);
        await invalidateWorkspaceMembers(workspaceId);
        revalidatePath(`/w/${workspaceId}/team`);

        // Broadcast real-time update
        broadcastTeamUpdate({
            workspaceId,
            type: "DELETE",
            payload: { memberId: workspaceMemberId },
        });

        return {
            status: "success",
            message: `User "${userName}" has been completely removed.`,
        };
    } catch (err) {
        console.error("deleteMemberAction error:", err);
        return {
            status: "error",
            message: "An unexpected error occurred while removing the member.",
        };
    }
}
