/** Desktop stand-in for apps/web/src/actions/board/board-actions.ts: the same BoardService calls via /board, same results. */
import { passthrough } from "../../lib/desktop-api";

export async function createBoardItem(workspaceId: string, memberId: string, note: string) {
    return passthrough("/board", { body: { workspaceId, memberId, note } }, "Failed to add note");
}

export async function toggleBoardItemStatus(workspaceId: string, itemId: string, currentStatus: "DONE" | "NOT_DONE") {
    return passthrough(`/board/${itemId}`, { method: "PATCH", body: { workspaceId, status: currentStatus } }, "Failed to update note");
}

export async function deleteBoardItem(workspaceId: string, itemId: string) {
    return passthrough(`/board/${itemId}`, { method: "DELETE", query: { workspaceId } }, "Failed to delete note");
}
