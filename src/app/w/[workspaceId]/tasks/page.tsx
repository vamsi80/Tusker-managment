import { Suspense } from "react";
import { requireUser } from "@/lib/auth/require-user";
import { WorkspaceTasksHeader } from "./_components/workspace-tasks-header";
import { WorkspaceListView } from "./_components/views/list/workspace-list-view";
import { WorkspaceGanttView } from "./_components/views/gantt/workspace-gantt-view";
import { WorkspaceKanbanView } from "./_components/views/kanban/workspace-kanban-view";
import { TaskTableSkeleton } from "@/components/task/list/list-skeleton";
import { KanbanBoardSkeleton } from "@/components/task/kanban/kanban-skeleton";
import { GanttChartSkeleton } from "@/components/task/gantt/gantt-skeleton";

interface WorkspaceTasksPageProps {
    params: Promise<{
        workspaceId: string;
    }>;
    searchParams: Promise<{
        view?: string;
    }>;
}

/**
 * Workspace Tasks Page
 * 
 * Shows all tasks from all projects in the workspace
 * Supports multiple views:
 * - List view (default)
 * - Kanban view
 * - Gantt view
 * 
 * Each view has its own specific skeleton loader
 */
export default async function WorkspaceTasksPage({
    params,
    searchParams,
}: WorkspaceTasksPageProps) {
    console.log("🟢 RSC: tasks/page.tsx render");
    // Ensure user is authenticated
    await requireUser();

    const { workspaceId } = await params;
    const { view = 'list' } = await searchParams;

    return (
        <div className="flex flex-col gap-6 pb-3 px-3 h-full">
            <WorkspaceTasksHeader workspaceId={workspaceId} />

            {view === 'list' && (
                <Suspense fallback={<TaskTableSkeleton />}>
                    <WorkspaceListView workspaceId={workspaceId} />
                </Suspense>
            )}

            {view === 'kanban' && (
                <Suspense fallback={<KanbanBoardSkeleton />}>
                    <WorkspaceKanbanView workspaceId={workspaceId} />
                </Suspense>
            )}

            {view === 'gantt' && (
                <Suspense fallback={<GanttChartSkeleton />}>
                    <WorkspaceGanttView workspaceId={workspaceId} />
                </Suspense>
            )}
        </div>
    );
}
