"use server";

import { getSession } from "@/lib/auth/require-user";
import { BoardStatus } from "@tusker/db";
import { BoardService } from "@tusker/core/server/services/board/board.service";
import { ApiResponse } from "@/lib/types";

async function actingUserId() {
    const session = await getSession();
    if (!session) throw new Error("Unauthorized");
    return session.user.id;
}

export async function createBoardItem(workspaceId: string, memberId: string, note: string): Promise<ApiResponse> {
    return BoardService.createBoardItem(await actingUserId(), workspaceId, memberId, note) as Promise<ApiResponse>;
}

export async function toggleBoardItemStatus(workspaceId: string, itemId: string, currentStatus: BoardStatus): Promise<ApiResponse> {
    return BoardService.toggleBoardItemStatus(await actingUserId(), workspaceId, itemId, currentStatus) as Promise<ApiResponse>;
}

export async function deleteBoardItem(workspaceId: string, itemId: string): Promise<ApiResponse> {
    return BoardService.deleteBoardItem(await actingUserId(), workspaceId, itemId) as Promise<ApiResponse>;
}
