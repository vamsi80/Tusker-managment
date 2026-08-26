import type { WorkspaceTaskType } from "@tusker/core/types/task";
import type { WorkspaceTaskType as SubTaskType } from "@tusker/core/types/task";

export type TaskWithSubTasks = WorkspaceTaskType & {
    subTasks?: SubTaskType[];
    subTasksHasMore?: boolean;
    subTasksPage?: number;
};
