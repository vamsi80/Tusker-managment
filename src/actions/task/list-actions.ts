"use server";

import { getWorkspaceTasks, WorkspaceTaskFilters } from "@/data/task";
import { getSubTasks } from "@/data/task/list/get-subtasks";
import { TaskFilters } from "@/types/task-filters";

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
    filters: WorkspaceTaskFilters = {},
    page: number = 1,
    pageSize: number = 10
) {
    try {
        const toArray = <T>(val: T | T[] | undefined): T[] | undefined => {
            if (val === undefined) return undefined;
            return Array.isArray(val) ? val : [val];
        };

        // Map WorkspaceTaskFilters to TaskFilters
        const taskFilters: TaskFilters = {
            workspaceId,
            projectId: filters.projectId,
            status: toArray(filters.status),
            assigneeId: toArray(filters.assigneeId),
            tagId: toArray(filters.tagId || filters.tag),
            search: filters.search,
            dueAfter: filters.startDate || filters.dueAfter,
            dueBefore: filters.endDate || filters.dueBefore,
            isPinned: filters.isPinned,
        };

        const result = await getSubTasks(parentTaskId, workspaceId, projectId, taskFilters, page, pageSize);
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
