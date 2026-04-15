import { TasksService } from "@/server/services/tasks.service";
import { TaskCursor } from "@/lib/tasks/query-builder";

export type TaskViewType = "list" | "kanban" | "gantt" | "calendar";

export interface GetTasksOptions {
    workspaceId: string;
    projectId?: string;
    hierarchyMode?: "parents" | "children" | "all";
    groupBy?: "status";

    status?: string | string[];
    permissionStatus?: string | string[];
    assigneeId?: string | string[];
    tagId?: string | string[];
    tag?: string | string[];
    search?: string;
    dueAfter?: string | Date;
    dueBefore?: string | Date;
    startDate?: string | Date;
    endDate?: string | Date;
    isPinned?: boolean;

    filterParentTaskId?: string;
    onlyParents?: boolean;
    excludeParents?: boolean;
    onlySubtasks?: boolean;

    cursor?: TaskCursor;
    skip?: number;
    expandedProjectIds?: string[];
    page?: number;
    limit?: number;
    includeSubTasks?: boolean;
    includeFacets?: boolean;

    view_mode?: "default" | "search" | "list" | "kanban" | "gantt" | "calendar";
    sorts?: Array<{ field: string; direction: "asc" | "desc" }>;
}

/**
 * Server-side entry point for fetching tasks.
 * Now wraps TasksService.listTasks to ensure consistent logic between Hono and RSC.
 */
export async function getTasks(opts: GetTasksOptions, userId: string) {
    return TasksService.listTasks(opts, userId);
}

/**
 * Shorthand for workspace-level fetching.
 */
export async function getWorkspaceTasks(opts: GetTasksOptions, userId: string) {
    return getTasks(opts, userId);
}

export type GetTasksResponse = Awaited<ReturnType<typeof getTasks>>;
