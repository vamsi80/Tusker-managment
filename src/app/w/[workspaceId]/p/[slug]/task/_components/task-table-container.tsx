import { getProjectTasks } from "@/app/data/task/get-project-tasks";
import { TaskData } from "./taskData";
import { ProjectMembersType } from "@/app/data/project/get-project-members";

interface TaskTableContainerProps {
    workspaceId: string;
    projectId: string;
    members: ProjectMembersType;
    canCreateSubTask: boolean;
}

export async function TaskTableContainer({
    workspaceId,
    projectId,
    members,
    canCreateSubTask,
}: TaskTableContainerProps) {
    const tasks = await getProjectTasks(projectId);

    return (
        <TaskData
            initialTasksData={tasks}
            members={members}
            workspaceId={workspaceId}
            projectId={projectId}
            canCreateSubTask={canCreateSubTask}
        />
    );
}
