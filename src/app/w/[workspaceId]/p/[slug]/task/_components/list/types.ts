import { ParentTaskType, FlatTaskType } from "@/data/task";

/**
 * Extended type for List view with client-side state
 * Subtasks are loaded on-demand when user expands a task
 */
export type TaskWithSubTasks = ParentTaskType & {
    subTasks?: FlatTaskType[];  // Loaded on-demand
    subTasksHasMore?: boolean;  // Pagination state
    subTasksPage?: number;      // Current page
};
