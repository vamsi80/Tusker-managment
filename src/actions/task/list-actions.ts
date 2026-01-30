"use server";

import { getWorkspaceTasks, WorkspaceTaskFilters, getAllTasksFlat } from "@/data/task";
import { getSubTasks } from "@/data/task/list/get-subtasks";
import { getSubTasksByParentIds } from "@/data/task/list/get-subtasks-batch";
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
 * Server Action: Load more parent tasks using getAllTasksFlat (for workspace list view)
 */
export async function loadMoreTasksFlatAction(
    workspaceId: string,
    projectId: string | undefined,
    page: number = 1,
    pageSize: number = 10
) {
    try {
        const result = await getAllTasksFlat(workspaceId, projectId, page, pageSize);

        // Transform to match expected format
        const tasks = result.tasks.map(task => ({
            ...task,
            subTasks: undefined, // Will be loaded on-demand
            createdBy: { user: { name: '', surname: '', image: '' } },
            _count: {
                subTasks: task._count.subTasks,
            },
        }));

        return {
            success: true,
            data: {
                tasks,
                hasMore: result.hasMore,
                totalCount: result.totalCount,
            },
        };
    } catch (error) {
        console.error("Error in loadMoreTasksFlatAction:", error);
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

/**
 * Server Action: Load subtasks for MULTIPLE parent tasks in a SINGLE query
 * 
 * This is the KEY optimization for expand/collapse performance:
 * - Reduces N database queries to 1 query
 * - Minimizes cold-start impact on Supabase Free tier
 * - Results are cached per batch for subsequent requests
 * 
 * Use this when:
 * - User clicks "Expand All"
 * - Prefetching subtasks for visible parent tasks
 * - Any scenario where multiple parent tasks need subtasks
 */
export async function loadSubTasksBatchAction(
    parentTaskIds: string[],
    workspaceId: string,
    projectId?: string,
    filters: WorkspaceTaskFilters = {},
    pageSize: number = 10
) {
    try {
        if (parentTaskIds.length === 0) {
            return {
                success: true,
                data: [],
            };
        }

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

        const result = await getSubTasksByParentIds(
            parentTaskIds,
            workspaceId,
            projectId,
            taskFilters,
            pageSize
        );

        return {
            success: true,
            data: result,
        };
    } catch (error) {
        console.error("Error in loadSubTasksBatchAction:", error);
        return {
            success: false,
            error: "Failed to load batch subtasks",
        };
    }
}
