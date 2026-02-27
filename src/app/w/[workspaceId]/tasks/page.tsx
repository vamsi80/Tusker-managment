import { Suspense } from "react";
import { requireUser } from "@/lib/auth/require-user";
import { WorkspaceListView } from "./_components/views/list/workspace-list-view";
import { WorkspaceGanttView } from "./_components/views/gantt/workspace-gantt-view";
import { WorkspaceKanbanView } from "./_components/views/kanban/workspace-kanban-view";
import { WorkspaceTasksSkeleton } from "@/components/shared/workspace-skeletons";
import { ReloadableView } from "@/components/shared/reloadable-view";

interface WorkspaceTasksPageProps {
    params: Promise<{ workspaceId: string }>;
    searchParams: Promise<{ view?: string }>;
}

// Header skeleton logic removed as it's now in the layout

// ─── Streaming view wrappers ──────────────────────────────────────────────────

async function ListView({ workspaceId }: { workspaceId: string }) {
    await requireUser();
    return <WorkspaceListView workspaceId={workspaceId} />;
}

async function KanbanView({ workspaceId }: { workspaceId: string }) {
    await requireUser();
    return <WorkspaceKanbanView workspaceId={workspaceId} />;
}

async function GanttView({ workspaceId }: { workspaceId: string }) {
    await requireUser();
    return <WorkspaceGanttView workspaceId={workspaceId} />;
}

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

    const skeleton = <WorkspaceTasksSkeleton />;

    return (
        <ReloadableView skeleton={skeleton}>
            {/* View content streams in - now without the outer div as layout handles it */}
            {view === "list" && (
                <Suspense fallback={skeleton}>
                    <ListView workspaceId={workspaceId} />
                </Suspense>
            )}

            {view === "kanban" && (
                <Suspense fallback={skeleton}>
                    <KanbanView workspaceId={workspaceId} />
                </Suspense>
            )}

            {view === "gantt" && (
                <Suspense fallback={skeleton}>
                    <GanttView workspaceId={workspaceId} />
                </Suspense>
            )}
        </ReloadableView>
    );
}
