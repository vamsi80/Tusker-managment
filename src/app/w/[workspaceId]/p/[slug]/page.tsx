import { Suspense } from "react";
import { getProjectBySlug } from "@/data/project/get-project-by-slug";
import { getProjectMembers } from "@/data/project/get-project-members";
import { TaskTableSkeleton } from "../../../../../components/task/list/list-skeleton";
import { GanttChartSkeleton } from "../../../../../components/task/gantt/gantt-skeleton";
import { KanbanBoardSkeleton } from "../../../../../components/task/kanban/kanban-skeleton";
import { ProjectDashboard } from "./_components/dashboard/project-dashboard";
import { ReloadableView } from "./_components/shared/reloadable-view";
import { ProjectTaskListView } from "./_components/list/project-task-list-view";

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
 * Task List View
 * 
 * Data Flow:
 * 1. Receives projectId and projectMembers from parent
 * 2. TaskTableContainer calls getWorkspaceTasks(workspaceId, { projectId })
 * 3. getWorkspaceTasks handles permissions internally via getUserPermissions
 * 
 * @see src/data/task/get-workspace-tasks.ts - Workspace-first task fetching
 */
async function TaskListView({
  workspaceId,
  projectId,
  projectMembers
}: {
  workspaceId: string;
  projectId: string;
  projectMembers: Awaited<ReturnType<typeof getProjectMembers>>;
}) {
  return (
    <ProjectTaskListView
      workspaceId={workspaceId}
      projectId={projectId}
      members={projectMembers}
      canCreateSubTask={true} // Will be determined by workspace function internally
    />
  );
}

/**
 * Kanban View Component
 * 
 * Data Flow:
 * 1. Receives projectId from parent
 * 2. KanbanContainerPaginated calls getSubTasksByStatus(workspaceId, status, projectId)
 * 3. getSubTasksByStatus handles permissions internally via getUserPermissions
 * 
 * @see src/data/task/kanban/get-subtasks-by-status.ts - Workspace-first subtask fetching
 */
async function TaskKanbanView({
  workspaceId,
  projectId
}: {
  workspaceId: string;
  projectId: string;
}) {
  const { ProjectKanbanView } = await import("./_components/kanban/project-kanban-view");

  return <ProjectKanbanView workspaceId={workspaceId} projectId={projectId} />;
}

/**
 * Gantt view component
 */
async function TaskGanttView({
  workspaceId,
  projectId
}: {
  workspaceId: string;
  projectId: string;
}) {
  const { GanttServerWrapper } = await import("./_components/gantt/project-gantt-view");

  return <GanttServerWrapper workspaceId={workspaceId} projectId={projectId} />;
}

/**
 * Project Page - Shows different views based on search params
 * 
 * OPTIMIZED ARCHITECTURE:
 * - Fetches project data ONCE at the page level
 * - Passes data down to view components
 * - Each workspace function handles its own permissions internally
 * - No redundant data fetching
 */
export default async function ProjectPage({ params, searchParams }: iAppProps) {
  const { workspaceId, slug } = await params;
  const { view = 'dashboard' } = await searchParams;

  const currentView = ['dashboard', 'list', 'kanban', 'gantt'].includes(view) ? view : 'dashboard';

  // ✅ Fetch project data ONCE for all views
  const project = await getProjectBySlug(workspaceId, slug);

  if (!project) {
    return <div>Project not found</div>;
  }

  // ✅ Only fetch project members if needed (for list view)
  const projectMembers = currentView === 'list'
    ? await getProjectMembers(project.id)
    : [];

  return (
    <>
      {/* Content streams in based on view */}
      {currentView === 'dashboard' && (
        <ReloadableView skeleton={<TaskTableSkeleton />}>
          <Suspense fallback={<TaskTableSkeleton />}>
            <ProjectDashboardPage />
          </Suspense>
        </ReloadableView>
      )}

      {currentView === 'list' && (
        <ReloadableView skeleton={<TaskTableSkeleton />}>
          <Suspense fallback={<TaskTableSkeleton />}>
            <TaskListView
              workspaceId={workspaceId}
              projectId={project.id}
              projectMembers={projectMembers}
            />
          </Suspense>
        </ReloadableView>
      )}

      {currentView === 'kanban' && (
        <ReloadableView skeleton={<KanbanBoardSkeleton />}>
          <Suspense fallback={<KanbanBoardSkeleton />}>
            <TaskKanbanView
              workspaceId={workspaceId}
              projectId={project.id}
            />
          </Suspense>
        </ReloadableView>
      )}

      {currentView === 'gantt' && (
        <ReloadableView skeleton={<GanttChartSkeleton />}>
          <Suspense fallback={<GanttChartSkeleton />}>
            <TaskGanttView
              workspaceId={workspaceId}
              projectId={project.id}
            />
          </Suspense>
        </ReloadableView>
      )}
    </>
  );
}
