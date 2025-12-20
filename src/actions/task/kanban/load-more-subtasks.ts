"use server";

import { getSubTasksByStatus } from "@/data/task/kanban/get-subtasks-by-status";

type TaskStatus = "TO_DO" | "IN_PROGRESS" | "BLOCKED" | "REVIEW" | "HOLD" | "COMPLETED";

/**
 * Server Action: Load More Subtasks
 * 
 * This is called from the client component when user clicks "Load More".
 * It directly calls the data function (same as initial load).
 * 
 * Uses workspace-first architecture with optional project filtering.
 * 
 * Benefits:
 * - Uses same cached data function
 * - No API route needed
 * - Automatic caching
 * - Works for both workspace and project Kanban
 */
export async function loadMoreSubtasksAction(
    workspaceId: string,
    status: TaskStatus,
    projectId?: string,
    page: number = 1,
    pageSize: number = 5
) {
    try {
        // ✅ Call same data function as initial load (workspace-first)
        const result = await getSubTasksByStatus(
            workspaceId,
            status,
            projectId,
            page,
            pageSize
        );

        return {
            success: true,
            data: result,
        };
    } catch (error) {
        console.error("Error loading more subtasks:", error);
        return {
            success: false,
            error: "Failed to load more subtasks",
            data: {
                subTasks: [],
                totalCount: 0,
                hasMore: false,
                currentPage: page,
            },
        };
    }
}
