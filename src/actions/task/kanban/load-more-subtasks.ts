"use server";

import { getTasks } from "@/data/task/get-tasks";

import { type TaskFilters } from "@/components/task/shared/types";

type TaskStatus = "TO_DO" | "IN_PROGRESS" | "CANCELLED" | "REVIEW" | "HOLD" | "COMPLETED";

/**
 * Server Action: Load More Subtasks
 * Used by Kanban Board to fetch next page of cards for a column.
 */
export async function loadMoreSubtasksAction(
    workspaceId: string,
    status: TaskStatus,
    projectId?: string,
    cursor?: any,
    pageSize: number = 5,
    filters?: TaskFilters
) {
    try {
        const result = await getTasks({
            workspaceId,
            projectId,
            hierarchyMode: "children",
            groupBy: "status",
            status,
            cursor,
            limit: pageSize,
            assigneeId: filters?.assigneeId,
            search: filters?.search,
            tagId: filters?.tagId,
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
                nextCursor: result.nextCursor,
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
                nextCursor: null,
            },
        };
    }
}
