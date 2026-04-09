"use server";

import prisma from "@/lib/db";
import { requireUser } from "@/lib/auth/require-user";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";
import { revalidatePath } from "next/cache";
import { BoardStatus } from "@/generated/prisma/client";
import { ApiResponse } from "@/lib/types";

export async function createBoardItem(workspaceId: string, memberId: string, note: string): Promise<ApiResponse> {
    try {
        const user = await requireUser();
        const perms = await getWorkspacePermissions(workspaceId, user.id);

        if (!perms.isWorkspaceAdmin && perms.workspaceMemberId !== memberId) {
            return { status: "error", message: "Unauthorized: You can only add notes to your own board." };
        }

        const newItem = await prisma.board.create({
            data: {
                workspaceId,
                memberId,
                assignedById: perms.workspaceMemberId!,
                note,
                status: "NOT_DONE",
            }
        });

        revalidatePath(`/w/${workspaceId}/my-board`);
        return { status: "success", message: "Note added successfully", data: newItem };
    } catch (error) {
        console.error("Error creating board item:", error);
        return { status: "error", message: "Failed to create note" };
    }
}

export async function toggleBoardItemStatus(workspaceId: string, itemId: string, currentStatus: BoardStatus): Promise<ApiResponse> {
    try {
        const user = await requireUser();
        const perms = await getWorkspacePermissions(workspaceId, user.id);

        const newStatus: BoardStatus = currentStatus === "DONE" ? "NOT_DONE" : "DONE";

        await prisma.board.update({
            where: { id: itemId },
            data: { status: newStatus }
        });

        revalidatePath(`/w/${workspaceId}/my-board`);
        return { status: "success", message: "Status updated" };
    } catch (error) {
        console.error("Error toggling status:", error);
        return { status: "error", message: "Failed to update status" };
    }
}

export async function deleteBoardItem(workspaceId: string, itemId: string): Promise<ApiResponse> {
    try {
        const user = await requireUser();
        const perms = await getWorkspacePermissions(workspaceId, user.id);

        // Fetch the item to check its assigner
        const item = await prisma.board.findUnique({
            where: { id: itemId },
            include: {
                assignedBy: {
                    select: { workspaceRole: true }
                }
            }
        });

        if (!item) return { status: "error", message: "Note not found" };

        const assignerRole = item.assignedBy.workspaceRole;
        const isAdminAssigner = assignerRole === "OWNER" || assignerRole === "ADMIN";

        // Security: Regular members cannot delete notes created by Admin/Owner
        if (!perms.isWorkspaceAdmin && isAdminAssigner) {
            return { status: "error", message: "You cannot delete notes created by an Admin." };
        }

        // Security: Ensure user has permission to delete this specific items
        // They must be an admin OR the assigner OR the owner of the card (if it wasn't assigned by admin)
        const isAssigner = item.assignedById === perms.workspaceMemberId;
        const isCardOwner = item.memberId === perms.workspaceMemberId;

        if (!perms.isWorkspaceAdmin && !isAssigner && !isCardOwner) {
            return { status: "error", message: "Unauthorized: You don't have permission to delete this note." };
        }

        await prisma.board.delete({
            where: { id: itemId }
        });

        revalidatePath(`/w/${workspaceId}/my-board`);
        return { status: "success", message: "Note deleted" };
    } catch (error) {
        console.error("Error deleting item:", error);
        return { status: "error", message: "Failed to delete note" };
    }
}
