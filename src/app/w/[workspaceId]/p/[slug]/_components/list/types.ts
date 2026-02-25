import { WorkspaceTaskType } from "@/data/task";
import { WorkspaceTaskType as SubTaskType } from "@/data/task";

export type TaskWithSubTasks = WorkspaceTaskType & {
    subTasks?: SubTaskType[];
    subTasksHasMore?: boolean;
    subTasksPage?: number;
};
