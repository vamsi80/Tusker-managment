"use server";

import { getSubTasksByStatus, KanbanFilters } from "@/data/task/kanban/get-subtasks-by-status";

type TaskStatus = "TO_DO" | "IN_PROGRESS" | "CANCELLED" | "REVIEW" | "HOLD" | "COMPLETED";

/**
 * Server Action: Load More Subtasks
 * ...
 */
export async function loadMoreSubtasksAction(
    workspaceId: string,
    status: TaskStatus,
    projectId?: string,
    page: number = 1,
    pageSize: number = 5,
    filters?: KanbanFilters
) {
    try {
        // ✅ Call same data function as initial load (workspace-first)
        const result = await getSubTasksByStatus(
            workspaceId,
            status,
            projectId,
            page,
            pageSize,
            filters
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
