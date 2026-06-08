import { apiFetch } from "@/lib/api-client/fetch-wrapper";
import { ApiResponse } from "@/types/api";

/** Mirrors the BoardStatus enum values from the Prisma schema */
type BoardStatus = "PENDING" | "IN_PROGRESS" | "DONE";

export async function createBoardItem(workspaceId: string, memberId: string, note: string): Promise<ApiResponse> {
    try {
        const response = await apiFetch<any>("/board", {
            method: "POST",
            body: JSON.stringify({ workspaceId, memberId, note }),
        });
        return { status: "success", message: "Note added successfully", data: response.data };
    } catch (error: any) {
        console.error("Error creating board item:", error);
        return { status: "error", message: error.message || "Failed to create note" };
    }
}

export async function toggleBoardItemStatus(workspaceId: string, itemId: string, currentStatus: BoardStatus): Promise<ApiResponse> {
    try {
        const response = await apiFetch<any>(`/board/${itemId}/status`, {
            method: "PATCH",
            body: JSON.stringify({ workspaceId, currentStatus }),
        });
        return { status: "success", message: "Status updated", data: response.data };
    } catch (error: any) {
        console.error("Error toggling status:", error);
        return { status: "error", message: error.message || "Failed to update status" };
    }
}

export async function deleteBoardItem(workspaceId: string, itemId: string): Promise<ApiResponse> {
    try {
        await apiFetch<any>(`/board/${itemId}?workspaceId=${workspaceId}`, {
            method: "DELETE",
        });
        return { status: "success", message: "Note deleted" };
    } catch (error: any) {
        console.error("Error deleting item:", error);
        return { status: "error", message: error.message || "Failed to delete note" };
    }
}
