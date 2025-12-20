// src/data/task/index.ts

// Workspace-level queries (PRIMARY - use these!)
export { getWorkspaceTasks, type WorkspaceTasksResponse, type WorkspaceTaskType, type WorkspaceTaskFilters } from "./get-workspace-tasks";

// View-specific queries
export { getAllTasksFlat, type AllTasksFlatResponse, type FlatTaskType } from "./gantt/get-all-tasks-flat";
export { getAllSubTasks, type AllSubTasksResponse, type SubTaskType } from "./kanban/get-all-subtasks";
export { getParentTasksOnly, type ParentTasksOnlyResponse, type ParentTaskType } from "./list/get-parent-tasks-only";
export { getSubTasks, type SubTasksResponse, type SubTaskType as PaginatedSubTaskType } from "./list/get-subtasks";

// Utility queries
export { getTaskById, type TaskByIdType } from "./get-task-by-id";
export { getTaskPageData, type TaskPageDataType } from "./get-task-page-data";
