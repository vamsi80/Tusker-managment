import { Hono } from "hono";
import { HonoVariables } from "../types";
import { AppError } from "@tusker/core/lib/errors/app-error";
import { BoardService } from "@tusker/core/server/services/board/board.service";
import { BoardStatus } from "@tusker/db";

/**
 * Personal board notes. The Trava backend never exposed these over HTTP, so
 * the mobile app's board screen was calling a route that did not exist.
 */
const board = new Hono<{ Variables: HonoVariables }>();

/** GET /board?workspaceId= */
board.get("/", async (c) => {
    const workspaceId = c.req.query("workspaceId");
    if (!workspaceId) throw AppError.ValidationError("Missing workspaceId");

    const data = await BoardService.getBoardData(workspaceId, c.get("user").id);
    return c.json({ success: true, data });
});

/** POST /board */
board.post("/", async (c) => {
    const { workspaceId, memberId, note } = await c.req.json();
    if (!workspaceId || !memberId || !note) {
        throw AppError.ValidationError("workspaceId, memberId and note are required");
    }

    const result = await BoardService.createBoardItem(c.get("user").id, workspaceId, memberId, note);
    if (result.status === "error") throw AppError.ValidationError(result.message);

    return c.json({ success: true, data: result.data, message: result.message });
});

/** PATCH /board/:itemId — toggles between DONE and NOT_DONE */
board.patch("/:itemId", async (c) => {
    const itemId = c.req.param("itemId");
    const { workspaceId, status } = await c.req.json();
    if (!workspaceId) throw AppError.ValidationError("Missing workspaceId");

    const result = await BoardService.toggleBoardItemStatus(
        c.get("user").id,
        workspaceId,
        itemId,
        (status ?? "NOT_DONE") as BoardStatus
    );
    if (result.status === "error") throw AppError.ValidationError(result.message);

    return c.json({ success: true, data: result.data, message: result.message });
});

/** DELETE /board/:itemId?workspaceId= */
board.delete("/:itemId", async (c) => {
    const itemId = c.req.param("itemId");
    const workspaceId = c.req.query("workspaceId");
    if (!workspaceId) throw AppError.ValidationError("Missing workspaceId");

    const result = await BoardService.deleteBoardItem(c.get("user").id, workspaceId, itemId);
    if (result.status === "error") throw AppError.ValidationError(result.message);

    return c.json({ success: true, message: result.message });
});

export default board;
