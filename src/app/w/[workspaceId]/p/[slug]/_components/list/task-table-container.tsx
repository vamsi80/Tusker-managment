import { getWorkspaceTasks } from "@/data/task/get-workspace-tasks";
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
 * Uses getWorkspaceTasks() with project filter - workspace-first architecture
 * - Fetches tasks from workspace level
 * - Filters by projectId for project-specific view
 * - Role-based filtering (ADMINs/LEADs see all, MEMBERs see only assigned)
 */
export async function TaskTableContainer({
    workspaceId,
    projectId,
    members,
    canCreateSubTask,
}: TaskTableContainerProps) {
    // Get first 10 tasks filtered by project (workspace-level query with project filter)
    const { tasks, hasMore, totalCount } = await getWorkspaceTasks(
        workspaceId,
        { projectId }, // Filter by project
        1,
        10
    );

    return (
        <TaskTable
            initialTasks={tasks}
            initialHasMore={hasMore ?? false}
            initialTotalCount={totalCount}
            members={members}
            workspaceId={workspaceId}
            projectId={projectId}
            canCreateSubTask={canCreateSubTask}
        />
    );
}
