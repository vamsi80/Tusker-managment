import { Suspense } from "react";
import { requireUser } from "@/lib/auth/require-user";
import { WorkspaceTasksHeader } from "./_components/workspace-tasks-header";
import { WorkspaceListView } from "./_components/views/list/workspace-list-view";
import { WorkspaceGanttView } from "./_components/views/gantt/workspace-gantt-view";
import { WorkspaceKanbanView } from "./_components/views/kanban/workspace-kanban-view";
import { WorkspaceTasksSkeleton } from "@/components/shared/workspace-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

interface WorkspaceTasksPageProps {
    params: Promise<{ workspaceId: string }>;
    searchParams: Promise<{ view?: string }>;
}

// Header skeleton — lightweight placeholder while permissions load
function HeaderSkeleton() {
    return (
        <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-7 sm:h-9 w-36 sm:w-52" />
            <div className="flex items-center gap-1.5 sm:gap-2">
                <Skeleton className="h-8 sm:h-9 w-20 sm:w-28 rounded-md" />
                <Skeleton className="h-8 sm:h-9 w-20 sm:w-28 rounded-md" />
            </div>
        </div>
    );
}

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
        <div className="flex flex-col gap-4 sm:gap-6 pb-3 px-0 h-full">
            {/* Header streams in independently */}
            <Suspense fallback={<HeaderSkeleton />}>
                <WorkspaceTasksHeader workspaceId={workspaceId} />
            </Suspense>

            {/* View content streams in */}
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
        </div>
    );
}
