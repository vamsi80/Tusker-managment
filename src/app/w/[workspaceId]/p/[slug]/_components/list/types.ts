import { WorkspaceTaskType } from "@/data/task";
import { SubTaskType } from "@/data/task/list/get-subtasks";

export type TaskWithSubTasks = WorkspaceTaskType & {
    subTasks?: SubTaskType[];
    subTasksHasMore?: boolean;
    subTasksPage?: number;
};
