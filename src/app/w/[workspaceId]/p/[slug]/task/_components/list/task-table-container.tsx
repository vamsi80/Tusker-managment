import { getProjectTasks } from "@/app/data/task/get-project-tasks";
import { ProjectMembersType } from "@/data/project/get-project-members";
import { TaskTable } from "./task-table";

interface TaskTableContainerProps {
    workspaceId: string;
    projectId: string;
    members: ProjectMembersType;
    canCreateSubTask: boolean;
}

/**
 * Server component that fetches initial task data and passes it to the client TaskTable component
 */
export async function TaskTableContainer({
    workspaceId,
    projectId,
    members,
    canCreateSubTask,
}: TaskTableContainerProps) {
    const tasks = await getProjectTasks(projectId, workspaceId);

    return (
        <TaskTable
            initialTasksData={tasks}
            members={members}
            workspaceId={workspaceId}
            projectId={projectId}
            canCreateSubTask={canCreateSubTask}
        />
    );
}
