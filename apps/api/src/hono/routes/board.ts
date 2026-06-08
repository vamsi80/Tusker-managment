import { Hono } from "hono";
import { HonoVariables } from "../types";
import { AppError } from "@tusker/shared/errors";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";
import { getDb, getPusher } from "@/lib/registry";
import { z } from "zod";
import { BoardStatus } from "@/generated/prisma";

const board = new Hono<{ Variables: HonoVariables }>();

const createBoardItemSchema = z.object({
    workspaceId: z.string(),
    memberId: z.string(),
    note: z.string().min(1),
});

const toggleBoardItemStatusSchema = z.object({
    workspaceId: z.string(),
    currentStatus: z.nativeEnum(BoardStatus),
});

// POST /api/v1/board
board.post("/", async (c) => {
    const user = c.get("user");
    const body = await c.req.json();
    const parsed = createBoardItemSchema.safeParse(body);
    if (!parsed.success) throw AppError.ValidationError("Invalid board item data");

    const { workspaceId, memberId, note } = parsed.data;
    const perms = await getWorkspacePermissions(workspaceId, user.id);

    if (!perms.isWorkspaceAdmin && perms.workspaceMemberId !== memberId) {
        throw AppError.Forbidden("Unauthorized: You can only add notes to your own board.");
    }

    const newItem = await getDb().board.create({
        data: {
            workspaceId,
            memberId,
            assignedById: perms.workspaceMemberId!,
            note,
            status: "NOT_DONE",
        }
    });

    const pusher = getPusher();
    if (pusher) {
        await pusher.trigger(`team-${workspaceId}`, "team_update", {
            workspaceId,
            userId: user.id,
            type: "UPDATE",
            action: "BOARD_UPDATED",
            payload: newItem,
        });
    }

    return c.json({ success: true, message: "Note added successfully", data: newItem });
});

// PATCH /api/v1/board/:itemId/status
board.patch("/:itemId/status", async (c) => {
    const user = c.get("user");
    const itemId = c.req.param("itemId");
    const body = await c.req.json();
    const parsed = toggleBoardItemStatusSchema.safeParse(body);
    if (!parsed.success) throw AppError.ValidationError("Invalid status data");

    const { workspaceId, currentStatus } = parsed.data;
    await getWorkspacePermissions(workspaceId, user.id);

    const newStatus: BoardStatus = currentStatus === "DONE" ? "NOT_DONE" : "DONE";

    const updatedItem = await getDb().board.update({
        where: { id: itemId },
        data: { status: newStatus }
    });

    const pusher = getPusher();
    if (pusher) {
        await pusher.trigger(`team-${workspaceId}`, "team_update", {
            workspaceId,
            userId: user.id,
            type: "UPDATE",
            action: "BOARD_UPDATED",
            payload: updatedItem,
        });
    }

    return c.json({ success: true, message: "Status updated", data: updatedItem });
});

// DELETE /api/v1/board/:itemId
board.delete("/:itemId", async (c) => {
    const user = c.get("user");
    const itemId = c.req.param("itemId");
    const workspaceId = c.req.query("workspaceId");
    if (!workspaceId) throw AppError.ValidationError("Missing workspaceId");

    const perms = await getWorkspacePermissions(workspaceId, user.id);

    // Fetch the item to check its assigner
    const item = await getDb().board.findUnique({
        where: { id: itemId },
        include: {
            assignedBy: {
                select: { workspaceRole: true }
            }
        }
    });

    if (!item) throw AppError.NotFound("Note not found");

    const assignerRole = item.assignedBy.workspaceRole;
    const isAdminAssigner = assignerRole === "OWNER" || assignerRole === "ADMIN";

    // Security: Regular members cannot delete notes created by Admin/Owner
    if (!perms.isWorkspaceAdmin && isAdminAssigner) {
        throw AppError.Forbidden("You cannot delete notes created by an Admin.");
    }

    // Security: Ensure user has permission to delete this specific items
    const isAssigner = item.assignedById === perms.workspaceMemberId;
    const isCardOwner = item.memberId === perms.workspaceMemberId;

    if (!perms.isWorkspaceAdmin && !isAssigner && !isCardOwner) {
        throw AppError.Forbidden("Unauthorized: You don't have permission to delete this note.");
    }

    const deletedItem = await getDb().board.delete({
        where: { id: itemId }
    });

    const pusher = getPusher();
    if (pusher) {
        await pusher.trigger(`team-${workspaceId}`, "team_update", {
            workspaceId,
            userId: user.id,
            type: "DELETE",
            action: "BOARD_UPDATED",
            payload: deletedItem,
        });
    }

    return c.json({ success: true, message: "Note deleted" });
});

export default board;
