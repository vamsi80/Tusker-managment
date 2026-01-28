import { getWorkspaceTasks } from "@/data/task/get-workspace-tasks";
import { getAllTasksFlat } from "@/data/task";
import { ProjectMembersType } from "@/data/project/get-project-members";
import { TaskTable } from "@/components/task/list/task-table";
import { extractAssigneeOptions } from "@/lib/utils/extract-filter-options";
import { getWorkspaceTags } from "@/data/tag/get-tags";

interface ProjectTaskListViewProps {
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
export async function ProjectTaskListView({
    workspaceId,
    projectId,
    members,
    canCreateSubTask,
}: ProjectTaskListViewProps) {
    // Get first 10 tasks filtered by project (workspace-level query with project filter)
    const { tasks, hasMore, totalCount } = await getWorkspaceTasks(
        workspaceId,
        { projectId }, // Filter by project
        1,
        10
    );

    // Fetch all tasks (flat) to extract assignees for the filter
    // This includes all subtasks, so we can show all assignees in the filter
    const { tasks: allTasksFlat } = await getAllTasksFlat(workspaceId, projectId);
    const assigneesFromTasks = extractAssigneeOptions(allTasksFlat);

    // Fetch workspace tags for subtask creation/editing
    const tagsData = await getWorkspaceTags(workspaceId);

    // Map tags to only include necessary fields (id, name)
    // This prevents passing database fields like createdAt, updatedAt to client components
    const tags = tagsData.map(tag => ({
        id: tag.id,
        name: tag.name,
    }));

    return (
        <TaskTable
            initialTasks={tasks}
            initialHasMore={hasMore ?? false}
            members={members}
            assignees={assigneesFromTasks}
            workspaceId={workspaceId}
            projectId={projectId}
            canCreateSubTask={canCreateSubTask}
            tags={tags}
        />
    );
}
