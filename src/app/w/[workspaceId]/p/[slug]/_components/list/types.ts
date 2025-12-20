import { FlatTaskType } from "@/data/task";
import { WorkspaceTaskType } from "@/data/task/get-workspace-tasks";

export type TaskWithSubTasks = WorkspaceTaskType[number] & {
    subTasks?: FlatTaskType[];
    subTasksHasMore?: boolean;
    subTasksPage?: number;
};
