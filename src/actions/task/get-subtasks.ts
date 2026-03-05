"use server";

import { getSubTasksByParentIds } from "@/data/task";
import { TaskFilters } from "@/types/task-filters";

export async function getSubTasksAction(
    parentTaskId: string,
    workspaceId: string,
    projectId?: string,
    filters: Partial<TaskFilters> = {},
    pageSize: number = 20,
    viewMode: string = "list"
) {
    try {
        const results = await getSubTasksByParentIds(
            [parentTaskId],
            workspaceId,
            projectId,
            filters,
            pageSize,
            viewMode
        );

        if (results && results.length > 0) {
            return {
                success: true,
                subTasks: results[0].subTasks,
                totalCount: results[0].totalCount,
                hasMore: results[0].hasMore
            };
        }

        return {
            success: true,
            subTasks: [],
            totalCount: 0,
            hasMore: false
        };
    } catch (error) {
        console.error("Error in getSubTasksAction:", error);
        return {
            success: false,
            error: "Failed to fetch subtasks"
        };
    }
}
