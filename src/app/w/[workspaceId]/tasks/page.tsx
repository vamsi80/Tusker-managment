import { Suspense } from "react";
import { WorkspaceListView } from "./_components/views/list/workspace-list-view";
import { WorkspaceGanttView } from "./_components/views/gantt/workspace-gantt-view";
import { AppLoader } from "@/components/shared/app-loader";
import { ReloadableView } from "@/components/shared/reloadable-view";
import WorkspaceKanbanView from "./_components/views/kanban/workspace-kanban-view";

interface WorkspaceTasksPageProps {
    params: Promise<{ workspaceId: string }>;
    searchParams: Promise<{ view?: string }>;
}

// Header skeleton logic removed as it's now in the layout

// ─── Page ─────────────────────────────────────────────────────────────────────

/**
 * Workspace Tasks Page — fully streaming.
 * Header and view content each load independently via their own Suspense.
 * Skeleton appears instantly via loading.tsx, then pieces stream in.
 */
export default async function WorkspaceTasksPage({
    params,
    searchParams,
}: WorkspaceTasksPageProps) {
    console.log("🟢 RSC: tasks/page.tsx render");

    const { workspaceId } = await params;
    const { view = "list" } = await searchParams;

    const loader = <AppLoader />;

    return (
        <ReloadableView skeleton={loader}>
            {/* View content streams in - now without the outer div as layout handles it */}
            {view === "list" && (
                <Suspense fallback={loader}>
                    <WorkspaceListView workspaceId={workspaceId} />
                </Suspense>
            )}

            {view === "kanban" && (
                <Suspense fallback={loader}>
                    <WorkspaceKanbanView workspaceId={workspaceId} />
                </Suspense>
            )}

            {view === "gantt" && (
                <Suspense fallback={loader}>
                    <WorkspaceGanttView workspaceId={workspaceId} />
                </Suspense>
            )}
        </ReloadableView>
    );
}
