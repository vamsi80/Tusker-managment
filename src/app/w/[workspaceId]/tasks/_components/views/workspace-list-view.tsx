import { requireUser } from "@/lib/auth/require-user";
import { WorkspaceTaskTableWrapper } from "../workspace-task-table-wrapper";
import { getWorkspaceTasks } from "@/data/task/get-workspace-tasks";

interface WorkspaceListViewProps {
    workspaceId: string;
}

/**
 * Workspace List View
 * 
 * Shows tasks from all projects in a table format with pagination
 * Uses the optimized getWorkspaceTasks function that:
 * - Fetches only 10 tasks initially
 * - Does NOT fetch subtasks (lazy-loaded on demand)
 * - Supports filtering
 * - Is permission-aware
 */
export async function WorkspaceListView({ workspaceId }: WorkspaceListViewProps) {

    // Fetch first 10 parent tasks from all projects in the workspace
    // Subtasks are lazy-loaded when user expands a task
    const { tasks, hasMore, totalCount } = await getWorkspaceTasks(workspaceId, {}, 1, 10);

    return (
        <div className="flex-1 overflow-hidden">
            <WorkspaceTaskTableWrapper
                tasks={tasks}
                workspaceId={workspaceId}
                initialHasMore={hasMore ?? false}
                initialTotalCount={totalCount ?? tasks.length}
            />
        </div>
    );
}
