import { ParentTaskType, FlatTaskType } from "@/data/task";
import { ProjectTaskType } from "@/data/task/get-project-tasks";

/**
 * Extended type for List view with client-side state
 * Now uses ProjectTaskType which includes subtasks from server
 */
export type TaskWithSubTasks = ProjectTaskType[number] & {
    subTasksHasMore?: boolean;  // Pagination state for subtasks
    subTasksPage?: number;      // Current page for subtasks
};
