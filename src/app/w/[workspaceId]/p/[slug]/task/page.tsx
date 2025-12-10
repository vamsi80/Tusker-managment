import { Suspense } from "react";
import Link from "next/link";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TaskHeaderSkeleton, TaskTableSkeleton } from "./_components/shared/task-page-skeleton";
import { TaskPageWrapper } from "./_components/shared/task-page-wrapper";
import { getTaskPageData, TaskPageDataType } from "@/app/data/task/get-task-page-data";
import { CreateTaskForm } from "./_components/forms/create-task-form";
import { BulkUploadForm } from "./_components/forms/bulk-upload-form";
import { ReloadButton } from "./_components/shared/reload-button";
import { LayoutList, LayoutGrid, GanttChartSquare } from "lucide-react";
import { TaskTableContainer } from "./_components/list/task-table-container";
import { ReloadableTaskTable } from "./_components/list/reloadable-task-table";
import { KanbanBoardSkeleton } from "./_components/kanban/kanban-skeleton";
import { GanttChartSkeleton } from "./_components/gantt/gantt-skeleton";

interface iAppProps {
    params: { workspaceId: string; slug: string };
    searchParams: { view?: string };
}

/**
 * Task Header Component - Fetches its own data
 */
async function TaskHeader({
    workspaceId,
    slug,
    currentView
}: {
    workspaceId: string;
    slug: string;
    currentView: string;
}) {
    const pageData = await getTaskPageData(workspaceId, slug);

    if (!pageData) {
        return (
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-destructive">Project Not Found</h1>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Your Tasks</h1>
                <div className="flex items-center gap-3">
                    <ReloadButton />
                    {pageData.permissions.canPerformBulkOperations && (
                        <>
                            <BulkUploadForm projectId={pageData.project.id} />
                            <CreateTaskForm projectId={pageData.project.id} />
                        </>
                    )}
                </div>
            </div>

            <Tabs value={currentView} className="w-full">
                <TabsList className="grid w-full max-w-md grid-cols-3">
                    <Link href="?view=list" className="w-full">
                        <TabsTrigger value="list" className="w-full gap-2">
                            <LayoutList className="h-4 w-4" />
                            <span className="hidden sm:inline">List</span>
                        </TabsTrigger>
                    </Link>
                    <Link href="?view=kanban" className="w-full">
                        <TabsTrigger value="kanban" className="w-full gap-2">
                            <LayoutGrid className="h-4 w-4" />
                            <span className="hidden sm:inline">Kanban</span>
                        </TabsTrigger>
                    </Link>
                    <Link href="?view=gantt" className="w-full">
                        <TabsTrigger value="gantt" className="w-full gap-2">
                            <GanttChartSquare className="h-4 w-4" />
                            <span className="hidden sm:inline">Gantt</span>
                        </TabsTrigger>
                    </Link>
                </TabsList>
            </Tabs>
        </div>
    );
}

/**
 * Task List View - Fetches its own data
 */
async function TaskListView({ workspaceId, slug }: { workspaceId: string; slug: string }) {
    const pageData = await getTaskPageData(workspaceId, slug);

    if (!pageData) return null;

    return (
        <TaskTableContainer
            workspaceId={pageData.project.workspaceId}
            projectId={pageData.project.id}
            members={pageData.projectMembers}
            canCreateSubTask={pageData.permissions.canCreateSubTask}
        />
    );
}

/**
 * Kanban view component - Fetches its own data
 */
async function TaskKanbanView({ workspaceId, slug }: { workspaceId: string; slug: string }) {
    const pageData = await getTaskPageData(workspaceId, slug);

    if (!pageData) return null;

    const { KanbanContainer } = await import("./_components/kanban/kanban-container");

    return <KanbanContainer workspaceId={pageData.project.workspaceId} projectId={pageData.project.id} />;
}

/**
 * Gantt view component - Fetches its own data
 */
async function TaskGanttView({ workspaceId, slug }: { workspaceId: string; slug: string }) {
    const pageData = await getTaskPageData(workspaceId, slug);

    if (!pageData) return null;

    const { GanttContainer } = await import("./_components/gantt/gantt-container");

    return <GanttContainer workspaceId={pageData.project.workspaceId} projectId={pageData.project.id} />;
}

/**
 * Task Page - STREAMING ARCHITECTURE
 * 
 * INSTANT NAVIGATION:
 * - Page shell renders immediately
 * - Skeleton shows instantly on navigation
 * - Data streams in progressively
 * - Each section fetches its own data inside Suspense
 * 
 * Benefits:
 * - Instant visual feedback
 * - Progressive rendering
 * - Better perceived performance
 * - No blocking data fetches
 */
export default async function ProjectTask({ params, searchParams }: iAppProps) {
    const { workspaceId, slug } = await params;
    const { view = 'list' } = await searchParams;

    const currentView = ['list', 'kanban', 'gantt'].includes(view) ? view : 'list';

    return (
        <TaskPageWrapper>
            {/* Header streams in first */}
            <Suspense fallback={<TaskHeaderSkeleton />}>
                <TaskHeader workspaceId={workspaceId} slug={slug} currentView={currentView} />
            </Suspense>

            {/* Content streams in based on view */}
            <div className="mt-4">
                {currentView === 'list' && (
                    <ReloadableTaskTable>
                        <Suspense fallback={<TaskTableSkeleton />}>
                            <TaskListView workspaceId={workspaceId} slug={slug} />
                        </Suspense>
                    </ReloadableTaskTable>
                )}

                {currentView === 'kanban' && (
                    <Suspense fallback={<KanbanBoardSkeleton />}>
                        <TaskKanbanView workspaceId={workspaceId} slug={slug} />
                    </Suspense>
                )}

                {currentView === 'gantt' && (
                    <Suspense fallback={<GanttChartSkeleton />}>
                        <TaskGanttView workspaceId={workspaceId} slug={slug} />
                    </Suspense>
                )}
            </div>
        </TaskPageWrapper>
    );
}
