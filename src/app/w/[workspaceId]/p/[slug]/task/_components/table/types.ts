import { ProjectTaskType, SubTaskType } from "@/app/data/task/get-project-tasks";

export type TaskWithSubTasks = ProjectTaskType[number] & {
    subTasks?: SubTaskType;
    subTasksHasMore?: boolean;
    subTasksPage?: number;
};
