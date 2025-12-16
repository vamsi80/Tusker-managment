import { getParentTasksOnly } from "@/data/task";
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
 * Uses getParentTasksOnly() - loads ONLY first 10 parent tasks for fast initial load
 * More parent tasks loaded on-demand with "Load More" button
 * Subtasks are loaded on-demand when user expands a task
 */
export async function TaskTableContainer({
    workspaceId,
    projectId,
    members,
    canCreateSubTask,
}: TaskTableContainerProps) {
    // Get ONLY first 10 parent tasks (no subtasks) for fast initial load
    const { tasks, hasMore, totalCount } = await getParentTasksOnly(projectId, workspaceId, 1, 10);

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
