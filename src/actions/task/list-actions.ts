"use server";

import { getWorkspaceTasks, WorkspaceTaskFilters } from "@/data/task";
import { getSubTasksByParentIds } from "@/data/task/get-subtasks-batch";
import { TaskFilters } from "@/types/task-filters";
import { SortConfig } from "@/components/task/shared/types";


/**
 * Server Action: Load more parent tasks for the list view
 */
export async function loadMoreTasksAction(
    workspaceId: string,
    filters: any = {},
    cursor?: any,
    pageSize: number = 10
) {
    console.log("🟢 ACTION: loadMoreTasksAction");
    try {

        const result = await getWorkspaceTasks({
            ...filters,
            workspaceId,
            status: filters.status as any,
            cursor,
            limit: pageSize,
            includeFacets: true,
            hierarchyMode: "parents",
        });
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
 * Server Action: Load more parent tasks (previously used getAllTasksFlat)
 */
export async function loadMoreTasksFlatAction(
    workspaceId: string,
    projectId: string | undefined,
    page: number = 1,
    pageSize: number = 10
) {
    console.log("🟢 ACTION: loadMoreTasksFlatAction");
    try {
        const result = await getWorkspaceTasks({
            workspaceId,
            projectId,
            hierarchyMode: "parents",
            limit: pageSize,
            // Note: getTasks uses cursor internally, page is legacy
        });

        return {
            success: true,
            data: {
                tasks: result.tasks,
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
    filters: any = {},
    cursor?: any,
    pageSize: number = 10
) {
    console.log("🟢 ACTION: loadSubTasksAction", parentTaskId);
    try {
        const toArray = <T>(val: T | T[] | undefined): T[] | undefined => {
            if (val === undefined) return undefined;
            return Array.isArray(val) ? val : [val];
        };

        // Map WorkspaceTaskFilters to TaskFilters
        const taskFilters: TaskFilters = {
            workspaceId,
            projectId: filters.projectId,
            status: toArray(filters.status) as any,
            assigneeId: toArray(filters.assigneeId),
            tagId: toArray(filters.tagId || filters.tag),
            search: filters.search,
            dueAfter: (filters.startDate || filters.dueAfter) as any,
            dueBefore: (filters.endDate || filters.dueBefore) as any,
            isPinned: undefined, // removed from schema
        };

        const result = await getWorkspaceTasks({
            ...taskFilters,
            projectId,
            filterParentTaskId: parentTaskId,
            cursor,
            limit: pageSize,
        });
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
    filters: WorkspaceTaskFilters = {} as any,
    pageSize: number = 10
) {
    console.log("🟢 ACTION: loadSubTasksBatchAction", parentTaskIds.length);
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
            status: toArray(filters.status) as any,
            assigneeId: toArray(filters.assigneeId),
            tagId: toArray(filters.tagId || filters.tag),
            search: filters.search,
            dueAfter: (filters.startDate || filters.dueAfter) as any,
            dueBefore: (filters.endDate || filters.dueBefore) as any,
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

/**
 * Server Action: Load sorted subtasks for the sorted view
 * 
 * This is used when sorting is active in the task table.
 * It fetches all subtasks (at any depth) and sorts them within each project.
 */
export async function loadSortedSubTasksAction(
    workspaceId: string,
    filters: WorkspaceTaskFilters = {} as any,
    sorts: SortConfig[] = [],
    page: number = 1,
    pageSize: number = 50
) {
    console.log("🟢 ACTION: loadSortedSubTasksAction");
    try {
        const result = await getWorkspaceTasks({
            ...filters,
            workspaceId,
            hierarchyMode: "children",
            limit: pageSize,
            includeFacets: true,
        });

        // Group by project as expected by the UI for this specific action
        const tasksByProject: Record<string, any[]> = {};
        result.tasks.forEach(task => {
            const pid = task.projectId || 'unknown';
            if (!tasksByProject[pid]) tasksByProject[pid] = [];
            tasksByProject[pid].push(task);
        });

        return {
            success: true,
            data: {
                tasksByProject,
                totalCount: result.totalCount,
                hasMore: result.hasMore,
            },
        };
    } catch (error) {
        console.error("Error in loadSortedSubTasksAction:", error);
        return {
            success: false,
            error: "Failed to load sorted subtasks",
        };
    }
}
