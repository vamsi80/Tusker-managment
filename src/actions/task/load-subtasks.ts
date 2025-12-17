"use server";

import { getSubTasks } from "@/data/task";

/**
 * Server action to load subtasks for a parent task
 * This replaces the client-side fetch call with server-side data fetching
 */
export async function loadSubTasksAction(
    parentTaskId: string,
    workspaceId: string,
    projectId: string,
    page: number = 1,
    pageSize: number = 10
) {
    try {
        const result = await getSubTasks(
            parentTaskId,
            workspaceId,
            projectId,
            page,
            pageSize
        );

        return {
            success: true,
            subTasks: result.subTasks,
            hasMore: result.hasMore,
            totalCount: result.totalCount,
            currentPage: result.currentPage,
        };
    } catch (error) {
        console.error("Error loading subtasks:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to load subtasks",
            subTasks: [],
            hasMore: false,
            totalCount: 0,
            currentPage: page,
        };
    }
}
