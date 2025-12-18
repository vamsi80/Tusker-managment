import { Suspense } from "react";
import { WorkspaceTasksHeader } from "./workspace-tasks-header";
import { WorkspaceListView } from "./views/workspace-list-view";
import { WorkspaceTasksSkeleton } from "./workspace-tasks-skeleton";
import { WorkspaceGanttView } from "./views/workspace-gantt-view";
import { WorkspaceKanbanView } from "./views/workspace-kanban-view";

interface WorkspaceTasksContentProps {
    workspaceId: string;
    view: string;
}

/**
 * Workspace Tasks Content
 * 
 * Renders the appropriate view based on the selected tab
 */
export async function WorkspaceTasksContent({
    workspaceId,
    view,
}: WorkspaceTasksContentProps) {
    return (
        <>
            <WorkspaceTasksHeader workspaceId={workspaceId} />

            <Suspense fallback={<WorkspaceTasksSkeleton />}>
                {view === 'list' && <WorkspaceListView workspaceId={workspaceId} />}
                {view === 'kanban' && <WorkspaceKanbanView workspaceId={workspaceId} />}
                {view === 'gantt' && <WorkspaceGanttView workspaceId={workspaceId} />}
            </Suspense>
        </>
    );
}
