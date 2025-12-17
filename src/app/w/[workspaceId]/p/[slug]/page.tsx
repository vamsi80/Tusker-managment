import { Suspense } from "react";
import { getTaskPageData } from "@/data/task";
import { ReloadButton } from "./task/_components/shared/reload-button";
import { CreateTaskForm } from "./_components/forms/create-task-form";
import { BulkUploadForm } from "./_components/forms/bulk-upload-form";
import { GanttChartSkeleton } from "./_components/layout/gantt-skeleton";
import { ProjectDashboard } from "./_components/dashboard/project-dashboard";
import { TaskPageWrapper } from "./task/_components/shared/task-page-wrapper";
import { KanbanBoardSkeleton } from "./_components/layout/kanban-skeleton";
import { TaskTableContainer } from "./task/_components/list/task-table-container";
import { ReloadableTaskTable } from "./task/_components/list/reloadable-task-table";
import { TaskHeaderSkeleton, TaskTableSkeleton } from "./_components/layout/list-skeleton";

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
}: {
  workspaceId: string;
  slug: string;
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
    <div className="flex items-center justify-between">
      <h1 className="text-2xl font-bold">Your Tasks</h1>
      <div className="flex items-center gap-3">
        <ReloadButton projectId={pageData.project.id} userId={pageData.user.id} />
        {pageData.permissions.canPerformBulkOperations && (
          <>
            <BulkUploadForm projectId={pageData.project.id} />
            <CreateTaskForm projectId={pageData.project.id} />
          </>
        )}
      </div>
    </div>
  );
}

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
 * Kanban view component - Fetches its own data
 */
async function TaskKanbanView({ workspaceId, slug }: { workspaceId: string; slug: string }) {
  const pageData = await getTaskPageData(workspaceId, slug);

  if (!pageData) return null;

  const { KanbanContainer } = await import("./task/_components/kanban/kanban-container");

  return <KanbanContainer workspaceId={pageData.project.workspaceId} projectId={pageData.project.id} />;
}

/**
 * Gantt view component - Fetches its own data
 */
async function TaskGanttView({ workspaceId, slug }: { workspaceId: string; slug: string }) {
  const pageData = await getTaskPageData(workspaceId, slug);

  if (!pageData) return null;

  const { GanttServerWrapper } = await import("./task/_components/gantt/gantt-server-wrapper");

  return <GanttServerWrapper workspaceId={pageData.project.workspaceId} projectId={pageData.project.id} />;
}

/**
 * Project Page - Now shows tasks by default with view switcher
 * 
 * STREAMING ARCHITECTURE:
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
export default async function ProjectPage({ params, searchParams }: iAppProps) {
  const { workspaceId, slug } = await params;
  const { view = 'dashboard' } = await searchParams;

  const currentView = ['dashboard', 'list', 'kanban', 'gantt'].includes(view) ? view : 'dashboard';

  return (
    <TaskPageWrapper>
      {/* Header streams in first */}
      <Suspense fallback={<TaskHeaderSkeleton />}>
        <TaskHeader workspaceId={workspaceId} slug={slug} />
      </Suspense>

      {/* Content streams in based on view */}
      <div className="mt-4">
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
      </div>
    </TaskPageWrapper>
  );
}
