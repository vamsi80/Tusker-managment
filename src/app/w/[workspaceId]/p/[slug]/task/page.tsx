import { Suspense } from "react";
import Link from "next/link";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TaskHeaderSkeleton, TaskTableSkeleton } from "./_components/shared/task-page-skeleton";
import { TaskPageWrapper } from "./_components/shared/task-page-wrapper";
import { getUserProjects, UserProjectsType } from "@/app/data/user/get-user-projects";
import { getProjectMembers } from "@/app/data/project/get-project-members";
import { getUserPermissions } from "@/app/data/user/get-user-permissions";
import { CreateTaskForm } from "./_components/forms/create-task-form";
import { BulkCreateTaskForm } from "./_components/forms/bulk-create-task-form";
import { ReloadButton } from "./_components/shared/reload-button";
import { LayoutList, LayoutGrid, GanttChartSquare } from "lucide-react";
import { TaskTableContainer } from "./_components/list/task-table-container";
import { ReloadableTaskTable } from "./_components/list/reloadable-task-table";
import { KanbanBoardSkeleton } from "./_components/kanban/kanban-skeleton";

interface iAppProps {
    params: { workspaceId: string; slug: string };
    searchParams: { view?: string };
}

/**
 * Async component that fetches project data and renders the header with view tabs
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
    const userProjects = await getUserProjects(workspaceId);
    const project = userProjects.find((p: UserProjectsType[number]) => p.slug === slug || p.id === slug);

    if (!project) {
        return (
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-destructive">Project Not Found</h1>
            </div>
        );
    }

    // Get user permissions using the centralized function
    const permissions = await getUserPermissions(workspaceId, project.id);

    return (
        <div className="space-y-4">
            {/* Header with Actions */}
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Your Tasks</h1>
                <div className="flex items-center gap-3">
                    <ReloadButton />
                    {/* Only show Create and Bulk Upload for ADMINs and LEADs */}
                    {permissions.canPerformBulkOperations && (
                        <>
                            <BulkCreateTaskForm projectId={project.id} />
                            <CreateTaskForm projectId={project.id} />
                        </>
                    )}
                </div>
            </div>

            {/* View Tabs */}
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
 * Async component that fetches all required data and renders the task table
 */
async function TaskListView({ workspaceId, slug }: { workspaceId: string; slug: string }) {
    const userProjects = await getUserProjects(workspaceId);
    const project = userProjects.find((p: UserProjectsType[number]) => p.slug === slug || p.id === slug);

    if (!project) {
        return (
            <div className="p-6 text-center text-muted-foreground">
                The project you're looking for doesn't exist.
            </div>
        );
    }

    const [projectMembers, userPermissions] = await Promise.all([
        getProjectMembers(project.id),
        getUserPermissions(workspaceId, project.id),
    ]);

    return (
        <TaskTableContainer
            workspaceId={workspaceId}
            projectId={project.id}
            members={projectMembers}
            canCreateSubTask={userPermissions.canCreateSubTask}
        />
    );
}

/**
 * Kanban view component (lazy loaded)
 */
async function TaskKanbanView({ workspaceId, slug }: { workspaceId: string; slug: string }) {
    const userProjects = await getUserProjects(workspaceId);
    const project = userProjects.find((p: UserProjectsType[number]) => p.slug === slug || p.id === slug);

    if (!project) {
        return (
            <div className="p-6 text-center text-muted-foreground">
                The project you're looking for doesn't exist.
            </div>
        );
    }

    const { KanbanContainer } = await import("./_components/kanban/kanban-container");

    return <KanbanContainer workspaceId={workspaceId} projectId={project.id} />;
}

/**
 * Gantt view component (placeholder)
 */
async function TaskGanttView({ workspaceId, slug }: { workspaceId: string; slug: string }) {
    const userProjects = await getUserProjects(workspaceId);
    const project = userProjects.find((p: UserProjectsType[number]) => p.slug === slug || p.id === slug);

    if (!project) {
        return (
            <div className="p-6 text-center text-muted-foreground">
                The project you're looking for doesn't exist.
            </div>
        );
    }

    return (
        <div className="flex items-center justify-center h-96 border-2 border-dashed rounded-lg">
            <div className="text-center space-y-2">
                <GanttChartSquare className="h-12 w-12 mx-auto text-muted-foreground" />
                <h3 className="text-lg font-semibold">Gantt Chart View</h3>
                <p className="text-sm text-muted-foreground">
                    Timeline and Gantt chart will be displayed here
                </p>
                <p className="text-xs text-muted-foreground">
                    Coming soon...
                </p>
            </div>
        </div>
    );
}

/**
 * Task Page - Multi-View with URL Query Parameters
 * 
 * Supports three views:
 * - List (default): Traditional table view
 * - Kanban: Drag-and-drop board view
 * - Gantt: Timeline/Gantt chart view
 * 
 * View is controlled by ?view= query parameter
 */
export default async function ProjectTask({ params, searchParams }: iAppProps) {
    const { workspaceId, slug } = await params;
    const { view = 'list' } = await searchParams;

    // Normalize view value
    const currentView = ['list', 'kanban', 'gantt'].includes(view) ? view : 'list';

    return (
        <TaskPageWrapper>
            {/* Task Header with View Tabs */}
            <Suspense fallback={<TaskHeaderSkeleton />}>
                <TaskHeader workspaceId={workspaceId} slug={slug} currentView={currentView} />
            </Suspense>

            {/* Content based on selected view */}
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
                    <Suspense fallback={<TaskTableSkeleton />}>
                        <TaskGanttView workspaceId={workspaceId} slug={slug} />
                    </Suspense>
                )}
            </div>
        </TaskPageWrapper>
    );
}
