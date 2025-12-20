"use server";

import { getSubTasksByStatus } from "@/data/task/kanban/get-subtasks-by-status";

type TaskStatus = "TO_DO" | "IN_PROGRESS" | "BLOCKED" | "REVIEW" | "HOLD" | "COMPLETED";

/**
 * Server Action: Load More Subtasks
 * 
 * This is called from the client component when user clicks "Load More".
 * It directly calls the data function (same as initial load).
 * 
 * Benefits:
 * - Uses same cached data function
 * - No API route needed
 * - Automatic caching
 */
export async function loadMoreSubtasksAction(
    projectId: string,
    workspaceId: string,
    status: TaskStatus,
    page: number,
    pageSize: number = 5
) {
    try {
        // ✅ Call same data function as initial load
        const result = await getSubTasksByStatus(
            projectId,
            workspaceId,
            status,
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
