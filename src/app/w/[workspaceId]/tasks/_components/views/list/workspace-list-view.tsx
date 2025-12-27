import { getWorkspaceTasks } from "@/data/task/get-workspace-tasks";
import { getAllTasksFlat } from "@/data/task/gantt/get-all-tasks-flat";
import { TaskTable } from "@/components/task/list/task-table";
import { extractAssigneeOptions } from "@/lib/utils/extract-filter-options";
import { getWorkspaceTags } from "@/data/tag/get-tags";

interface WorkspaceListViewProps {
    workspaceId: string;
}

/**
 * Workspace List View
 * 
 * Server component that fetches workspace-level tasks and displays them in a table
 * - Shows tasks from all projects in the workspace
 * - Permission-based filtering (ADMIN/OWNER see all, MEMBER sees only assigned)
 * - Supports pagination with "Load More" button
 * - Advanced filters for project, status, assignee, tags, date range
 */
export async function WorkspaceListView({
    workspaceId,
}: WorkspaceListViewProps) {
    // Get first 10 tasks from workspace (no project filter)
    const { tasks, hasMore, totalCount } = await getWorkspaceTasks(
        workspaceId,
        {}, // No filters - get all accessible tasks
        1,
        10
    );

    // Fetch all tasks (flat) to extract assignees for the filter
    const { tasks: allTasksFlat } = await getAllTasksFlat(workspaceId);
    const assigneesFromTasks = extractAssigneeOptions(allTasksFlat);

    // Transform workspace tasks to match TaskWithSubTasks format
    // IMPORTANT: subTasks must be undefined (not empty array) for lazy-loading to work
    const transformedTasks = tasks.map(task => ({
        ...task,
        subTasks: undefined, // undefined = not loaded yet, will trigger fetch on expand
        createdBy: task.createdBy || { user: { name: '', surname: '', image: '' } },
        _count: {
            subTasks: task._count.subTasks,
        },
        // Store projectId in the task so TaskTable can use it for fetching subtasks
        projectId: task.projectId,
    }));

    const tagsData = await getWorkspaceTags(workspaceId);

    // Map tags to only include necessary fields (id, name)
    // This prevents passing database fields like createdAt, updatedAt to client components
    const tags = tagsData.map(tag => ({
        id: tag.id,
        name: tag.name,
    }));

    return (
        <TaskTable
            initialTasks={transformedTasks as any}
            initialHasMore={hasMore ?? false}
            initialTotalCount={totalCount}
            members={[]} // No project-specific members at workspace level
            assignees={assigneesFromTasks}
            workspaceId={workspaceId}
            projectId={tasks[0]?.projectId || ""} // Fallback for compatibility
            canCreateSubTask={false} // No create at workspace level
            showAdvancedFilters={true} // Show advanced filters including project filter
            tags={tags}
        />
    );
}
