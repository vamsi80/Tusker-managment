import type { WorkspaceTaskType } from "@/types/task";
import type { WorkspaceTaskType as SubTaskType } from "@/types/task";

export type TaskWithSubTasks = WorkspaceTaskType & {
    subTasks?: SubTaskType[];
    subTasksHasMore?: boolean;
    subTasksPage?: number;
};
