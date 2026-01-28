import { SubTaskType } from "@/data/task/list/get-subtasks";
import { WorkspaceTaskType } from "@/data/task/get-workspace-tasks";

export type TaskWithSubTasks = WorkspaceTaskType & {
    subTasks?: SubTaskType[];
    subTasksHasMore?: boolean;
    subTasksPage?: number;
};
