"use server";

import { getWorkspaceTasks } from "@/data/task/get-workspace-tasks";
import { getSubTasks } from "@/data/task/list/get-subtasks";
import { WorkspaceTaskFilters } from "@/data/task/get-workspace-tasks";

/**
 * Server Action: Load more parent tasks for the list view
 */
export async function loadMoreTasksAction(
    workspaceId: string,
    filters: WorkspaceTaskFilters = {},
    page: number = 1,
    pageSize: number = 10
) {
    try {
        const result = await getWorkspaceTasks(workspaceId, filters, page, pageSize);
        return {
            success: true,
            data: result,
        };
    } catch (error) {
        console.error("Error in loadMoreTasksAction:", error);
        return {
            success: false,
            error: "Failed to load more tasks",
        };
    }
}

/**
 * Server Action: Load subtasks for a parent task for the list view
 */
export async function loadSubTasksAction(
    parentTaskId: string,
    workspaceId: string,
    projectId: string,
    page: number = 1,
    pageSize: number = 10
) {
    try {
        const result = await getSubTasks(parentTaskId, workspaceId, projectId, page, pageSize);
        return {
            success: true,
            data: result,
        };
    } catch (error) {
        console.error("Error in loadSubTasksAction:", error);
        return {
            success: false,
            error: "Failed to load subtasks",
        };
    }
}
