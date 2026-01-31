// Unified Task Fetcher
export { getTasks as getWorkspaceTasks, type GetTasksResponse as WorkspaceTasksResponse, type GetTasksOptions as WorkspaceTaskFilters } from "./get-tasks";
export type { WorkspaceTaskType } from "./legacy-types"; // We will create this shim to avoid breaking changes if specific types were relied on
export { getAllTasksFlat, type AllTasksFlatResponse, type FlatTaskType } from "./gantt/get-all-tasks-flat";
export { getParentTasksOnly, type ParentTasksOnlyResponse, type ParentTaskType } from "./list/get-parent-tasks-only";
export { getSubTasks, type SubTasksResponse, type SubTaskType as PaginatedSubTaskType } from "./list/get-subtasks";
export { getTaskById, type TaskByIdType } from "./get-task-by-id";
export { getTaskPageData, type TaskPageDataType } from "./get-task-page-data";
