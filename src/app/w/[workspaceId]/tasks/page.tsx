import { Suspense } from "react";
import { requireUser } from "@/lib/auth/require-user";
import { WorkspaceTasksSkeleton } from "./_components/workspace-tasks-skeleton";
import { WorkspaceTasksContent } from "./_components/workspace-tasks-content";

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
 */
export default async function WorkspaceTasksPage({
    params,
    searchParams,
}: WorkspaceTasksPageProps) {
    // Ensure user is authenticated
    await requireUser();

    const { workspaceId } = await params;
    const { view = 'list' } = await searchParams;

    return (
        <div className="flex flex-col gap-6 pb-3 px-3 h-full">
            <Suspense fallback={<WorkspaceTasksSkeleton />}>
                <WorkspaceTasksContent
                    workspaceId={workspaceId}
                    view={view}
                />
            </Suspense>
        </div>
    );
}