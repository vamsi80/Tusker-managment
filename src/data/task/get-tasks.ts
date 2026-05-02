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

import { unstable_cache } from "next/cache";
import { CacheTags } from "@/data/cache-tags";

/**
 * Server-side entry point for fetching tasks.
 * Now wraps TasksService.listTasks to ensure consistent logic between Hono and RSC.
 */
export async function getTasks(opts: GetTasksOptions, userId: string) {
    const fetcher = async () => {
        return TasksService.listTasks(opts, userId);
    };

    const tags = [
        ...CacheTags.workspaceTasks(opts.workspaceId, userId),
    ];
    if (opts.projectId) {
        tags.push(`project-tasks-${opts.projectId}`);
    }

    return unstable_cache(
        fetcher,
        [`getTasks-${userId}-${JSON.stringify(opts)}`],
        {
            tags,
            revalidate: 3600 // 1 hour fallback
        }
    )();
}

/**
 * Shorthand for workspace-level fetching.
 */
export async function getWorkspaceTasks(opts: GetTasksOptions, userId: string) {
    return getTasks(opts, userId);
}

export type GetTasksResponse = Awaited<ReturnType<typeof getTasks>>;
