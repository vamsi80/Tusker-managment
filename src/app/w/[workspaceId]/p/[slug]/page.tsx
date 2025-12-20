import { Suspense } from "react";
import { getTaskPageData } from "@/data/task";
import { TaskTableSkeleton } from "./_components/layout/list-skeleton";
import { GanttChartSkeleton } from "./_components/layout/gantt-skeleton";
import { KanbanBoardSkeleton } from "./_components/layout/kanban-skeleton";
import { ProjectDashboard } from "./_components/dashboard/project-dashboard";
import { TaskTableContainer } from "./_components/list/task-table-container";
import { ReloadableTaskTable } from "./_components/list/reloadable-task-table";

interface iAppProps {
  params: { workspaceId: string; slug: string };
  searchParams: { view?: string };
}

/**
 * Dashboard View
 */
async function ProjectDashboardPage() {
  return (
    <ProjectDashboard />
  )
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
 * Kanban view component
 * Uses paginated version for better performance (loads 20 cards per column)
 * 
 * Optimized: Gets projectId from context
 */
async function TaskKanbanView({ workspaceId, slug }: { workspaceId: string; slug: string }) {
  const { KanbanContainerPaginated } = await import("./_components/kanban/kanban-container-paginated");

  // Get project data from layout context
  // Since this is a server component, we need to get it from the layout
  const { getTaskPageData } = await import("@/data/task");
  const pageData = await getTaskPageData(workspaceId, slug);

  if (!pageData) return null;

  return <KanbanContainerPaginated workspaceId={workspaceId} projectId={pageData.project.id} />;
}

/**
 * Gantt view component - Fetches its own data
 * 
 * Optimized: Only fetches project info, not full page data
 * GanttServerWrapper handles its own data fetching
 */
async function TaskGanttView({ workspaceId, slug }: { workspaceId: string; slug: string }) {
  const [
    { getProjectBySlug },
    { GanttServerWrapper }
  ] = await Promise.all([
    import("@/data/project/get-project-by-slug"),
    import("./_components/gantt/gantt-server-wrapper")
  ]);

  const project = await getProjectBySlug(workspaceId, slug);

  if (!project) return null;

  return <GanttServerWrapper workspaceId={workspaceId} projectId={project.id} />;
}

/**
 * Project Page - Shows different views based on search params
 * 
 * STREAMING ARCHITECTURE:
 * - Layout handles header (project name + nav) and TaskContext
 * - Page handles view-specific content
 * - Each view fetches only its own data
 * - Suspense boundaries show appropriate skeletons
 */
export default async function ProjectPage({ params, searchParams }: iAppProps) {
  const { workspaceId, slug } = await params;
  const { view = 'dashboard' } = await searchParams;

  const currentView = ['dashboard', 'list', 'kanban', 'gantt'].includes(view) ? view : 'dashboard';

  return (
    <>
      {/* Content streams in based on view */}
      {currentView === 'dashboard' && (
        <ReloadableTaskTable>
          <Suspense fallback={<TaskTableSkeleton />}>
            <ProjectDashboardPage />
          </Suspense>
        </ReloadableTaskTable>
      )}
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
    </>
  );
}
