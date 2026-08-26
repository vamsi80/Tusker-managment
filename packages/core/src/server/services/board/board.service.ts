import prisma from "@tusker/db";
import { BoardStatus } from "@tusker/db";
import { revalidatePath } from "../../../lib/cache/next-cache";
import { fetchWorkspacePermissions } from "../../../permissions";

/**
 * Personal board ("my board") notes.
 *
 * The caller supplies the acting user, so the same rules apply to a web
 * Server Action, an API request from mobile, and the assistant.
 */

export type BoardResult<T = unknown> =
    | { status: "success"; message: string; data?: T }
    | { status: "error"; message: string };

export class BoardService {
    /**
     * Admins see every member's board; everyone else sees only their own.
     */
    static async getBoardData(workspaceId: string, userId: string) {
        const perms = await fetchWorkspacePermissions(workspaceId, userId);

        if (!perms.hasAccess) {
            return { members: [], isOwner: false, currentMemberId: null };
        }

        const members = await prisma.workspaceMember.findMany({
            where: {
                workspaceId,
                ...(perms.isWorkspaceAdmin ? {} : { userId }),
            },
            include: {
                user: {
                    select: { id: true, name: true, surname: true, image: true, email: true },
                },
                boardItems: {
                    include: {
                        assignedBy: {
                            include: {
                                user: { select: { id: true, name: true, surname: true } },
                            },
                        },
                    },
                    orderBy: { createdAt: "desc" },
                },
            },
            orderBy: { user: { name: "asc" } },
        });

        return {
            members,
            isOwner: perms.isWorkspaceAdmin,
            currentMemberId: perms.workspaceMemberId,
        };
    }

    static async createBoardItem(
        userId: string,
        workspaceId: string,
        memberId: string,
        note: string
    ): Promise<BoardResult> {
        try {
            const perms = await fetchWorkspacePermissions(workspaceId, userId);

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
                },
            });

            await revalidatePath(`/w/${workspaceId}/my-board`);
            return { status: "success", message: "Note added successfully", data: newItem };
        } catch (error) {
            console.error("Error creating board item:", error);
            return { status: "error", message: "Failed to create note" };
        }
    }

    static async toggleBoardItemStatus(
        userId: string,
        workspaceId: string,
        itemId: string,
        currentStatus: BoardStatus
    ): Promise<BoardResult> {
        try {
            await fetchWorkspacePermissions(workspaceId, userId);
            const newStatus: BoardStatus = currentStatus === "DONE" ? "NOT_DONE" : "DONE";

            await prisma.board.update({
                where: { id: itemId },
                data: { status: newStatus },
            });

            await revalidatePath(`/w/${workspaceId}/my-board`);
            return { status: "success", message: "Status updated", data: { status: newStatus } };
        } catch (error) {
            console.error("Error toggling status:", error);
            return { status: "error", message: "Failed to update status" };
        }
    }

    static async deleteBoardItem(
        userId: string,
        workspaceId: string,
        itemId: string
    ): Promise<BoardResult> {
        try {
            const perms = await fetchWorkspacePermissions(workspaceId, userId);

            const item = await prisma.board.findUnique({
                where: { id: itemId },
                include: { assignedBy: { select: { workspaceRole: true } } },
            });

            if (!item) return { status: "error", message: "Note not found" };

            const assignerRole = item.assignedBy.workspaceRole;
            const isAdminAssigner = assignerRole === "OWNER" || assignerRole === "ADMIN";

            // Regular members cannot delete notes created by an Admin/Owner.
            if (!perms.isWorkspaceAdmin && isAdminAssigner) {
                return { status: "error", message: "You cannot delete notes created by an Admin." };
            }

            // Otherwise you must be an admin, the assigner, or the card owner.
            const isAssigner = item.assignedById === perms.workspaceMemberId;
            const isCardOwner = item.memberId === perms.workspaceMemberId;

            if (!perms.isWorkspaceAdmin && !isAssigner && !isCardOwner) {
                return { status: "error", message: "Unauthorized: You don't have permission to delete this note." };
            }

            await prisma.board.delete({ where: { id: itemId } });

            await revalidatePath(`/w/${workspaceId}/my-board`);
            return { status: "success", message: "Note deleted" };
        } catch (error) {
            console.error("Error deleting item:", error);
            return { status: "error", message: "Failed to delete note" };
        }
    }
}
