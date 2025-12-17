"use server";

import { getParentTasksOnly } from "@/data/task";

/**
 * Server action to load parent tasks with pagination
 * This replaces the client-side fetch call with server-side data fetching
 */
export async function loadTasksAction(
    projectId: string,
    workspaceId: string,
    page: number = 1,
    pageSize: number = 10
) {
    try {
        const result = await getParentTasksOnly(
            projectId,
            workspaceId,
            page,
            pageSize
        );

        return {
            success: true,
            tasks: result.tasks,
            hasMore: result.hasMore,
            totalCount: result.totalCount,
            currentPage: result.currentPage,
        };
    } catch (error) {
        console.error("Error loading tasks:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to load tasks",
            tasks: [],
            hasMore: false,
            totalCount: 0,
            currentPage: page,
        };
    }
}
