import { getProjectTasks } from "@/data/task/get-project-tasks";
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
 * Uses getProjectTasks() - loads parent tasks WITH subtasks based on user role
 * - ADMINs/LEADs: See all tasks with all subtasks
 * - MEMBERs: See only tasks with subtasks assigned to them
 */
export async function TaskTableContainer({
    workspaceId,
    projectId,
    members,
    canCreateSubTask,
}: TaskTableContainerProps) {
    // Get first 10 parent tasks WITH subtasks (role-based filtering)
    const { tasks, hasMore, totalCount } = await getProjectTasks(
        projectId,
        workspaceId,
        1,
        10
    );

    return (
        <TaskTable
            initialTasks={tasks}
            initialHasMore={hasMore}
            initialTotalCount={totalCount}
            members={members}
            workspaceId={workspaceId}
            projectId={projectId}
            canCreateSubTask={canCreateSubTask}
        />
    );
}
