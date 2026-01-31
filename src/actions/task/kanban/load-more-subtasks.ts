"use server";

import { getTasks } from "@/data/task/get-tasks";

// Legacy type definition for compatibility with existing calls
interface KanbanFilters {
    assigneeId?: string;
    parentTaskId?: string;
    searchQuery?: string;
    startDate?: string;
    endDate?: string;
    tag?: string;
}

type TaskStatus = "TO_DO" | "IN_PROGRESS" | "CANCELLED" | "REVIEW" | "HOLD" | "COMPLETED";

/**
 * Server Action: Load More Subtasks
 * Used by Kanban Board to fetch next page of cards for a column.
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
        const result = await getTasks({
            workspaceId,
            projectId,
            view: "kanban",
            status,
            page,
            limit: pageSize,
            assigneeId: filters?.assigneeId,
            search: filters?.searchQuery,
            tag: filters?.tag,
            startDate: filters?.startDate,
            endDate: filters?.endDate,
            filterParentTaskId: filters?.parentTaskId,
        });

        // Adapt response to match component expectation
        // Component expects { subTasks: [], ... }
        return {
            success: true,
            data: {
                subTasks: result.tasks,
                totalCount: result.totalCount,
                hasMore: result.hasMore,
                currentPage: page,
            },
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
