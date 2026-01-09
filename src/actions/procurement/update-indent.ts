"use server";

import { revalidatePath } from "next/cache";
import db from "@/lib/db";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";
import { IndentStatus } from "@/generated/prisma";

interface UpdateIndentParams {
    workspaceId: string;
    indentId: string;
    status?: IndentStatus;
    items?: {
        id: string; // IndentItem ID
        quantity: number;
    }[];
}

export async function updateIndent({
    workspaceId,
    indentId,
    status,
    items,
}: UpdateIndentParams) {
    try {
        // Verify permissions
        const permissions = await getWorkspacePermissions(workspaceId);

        if (!permissions.workspaceMember) {
            return { error: "Access denied" };
        }

        const isAdminOrOwner = permissions.isWorkspaceAdmin;
        const currentMemberId = permissions.workspaceMember.id;

        // User: "approve... if he is the admin".
        if (status && (status === "APPROVED" || status === "REJECTED")) {
            if (!isAdminOrOwner) {
                return { error: "Only admins can approve or reject indents" };
            }
        }

        // If updating quantities
        if (items && !isAdminOrOwner) {
            // Check if user is creator and status is REQUESTED
            const indent = await db.indentDetails.findUnique({ where: { id: indentId } });
            if (indent?.requestedBy !== currentMemberId) { // Not creator
                return { error: "Only admins can modify items" };
            }
            if (indent.status !== "REQUESTED") {
                return { error: "Cannot modify items after processing started" };
            }
        }

        await db.$transaction(async (tx) => {
            // Update items if provided
            if (items && items.length > 0) {
                for (const item of items) {
                    await tx.indentItem.update({
                        where: { id: item.id },
                        data: { quantity: item.quantity },
                    });
                }
            }

            // Update details if status provided
            if (status) {
                await tx.indentDetails.update({
                    where: { id: indentId },
                    data: { status },
                });
            }
        });

        revalidatePath(`/w/${workspaceId}/procurement`);
        return { success: true };

    } catch (error) {
        console.error("Error updating indent:", error);
        return { error: "Failed to update indent" };
    }
}
