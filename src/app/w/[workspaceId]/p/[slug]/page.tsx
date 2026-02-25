import { Suspense } from "react";
import { getProjectBySlug } from "@/data/project/get-project-by-slug";
import { getProjectMembers } from "@/data/project/get-project-members";
import { ProjectDashboard } from "./_components/dashboard/project-dashboard";
import { ReloadableView } from "./_components/shared/reloadable-view";
import { ProjectTaskListView } from "./_components/list/project-task-list-view";
import { getUserPermissions } from "@/data/user/get-user-permissions";
import { requireUser } from "@/lib/auth/require-user";
import { ProjectPageSkeleton } from "@/components/shared/project-page-skeleton";

interface iAppProps {
  params: Promise<{ workspaceId: string; slug: string }>;
  searchParams: Promise<{ view?: string }>;
}

// ─── Streaming view components ────────────────────────────────────────────────
// Each fetches only what it needs, wrapped in Suspense by the caller.

async function DashboardView() {
  return <ProjectDashboard />;
}

async function ListView({
  workspaceId,
  slug,
}: {
  workspaceId: string;
  slug: string;
}) {
  const [project, user] = await Promise.all([
    getProjectBySlug(workspaceId, slug),
    requireUser(),
  ]);
  if (!project) return null;

  const [projectMembers, permissions] = await Promise.all([
    getProjectMembers(project.id),
    getUserPermissions(workspaceId, project.id),
  ]);

  return (
    <ProjectTaskListView
      workspaceId={workspaceId}
      projectId={project.id}
      members={projectMembers}
      canCreateSubTask={permissions.canCreateSubTask}
      permissions={permissions}
      userId={user.id}
    />
  );
}

async function KanbanView({
  workspaceId,
  slug,
}: {
  workspaceId: string;
  slug: string;
}) {
  const project = await getProjectBySlug(workspaceId, slug);
  if (!project) return null;

  const { ProjectKanbanView } = await import(
    "./_components/kanban/project-kanban-view"
  );
  return <ProjectKanbanView workspaceId={workspaceId} projectId={project.id} />;
}

async function GanttView({
  workspaceId,
  slug,
}: {
  workspaceId: string;
  slug: string;
}) {
  const project = await getProjectBySlug(workspaceId, slug);
  if (!project) return null;

  const { GanttServerWrapper } = await import(
    "./_components/gantt/project-gantt-view"
  );
  return <GanttServerWrapper workspaceId={workspaceId} projectId={project.id} />;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

/**
 * Project Page — streams content based on view param.
 *
 * No top-level awaits: each view component fetches its own data inside a
 * Suspense boundary. All Suspense fallbacks use the single ProjectPageSkeleton
 * so loading states look identical everywhere (mobile-responsive).
 */
export default async function ProjectPage({ params, searchParams }: iAppProps) {
  const { workspaceId, slug } = await params;
  const { view = "dashboard" } = await searchParams;

  const currentView = ["dashboard", "list", "kanban", "gantt"].includes(view)
    ? view
    : "dashboard";

  const skeleton = <ProjectPageSkeleton />;

  return (
    <>
      {currentView === "dashboard" && (
        <ReloadableView skeleton={skeleton}>
          <Suspense fallback={skeleton}>
            <DashboardView />
          </Suspense>
        </ReloadableView>
      )}

      {currentView === "list" && (
        <ReloadableView skeleton={skeleton}>
          <Suspense fallback={skeleton}>
            <ListView workspaceId={workspaceId} slug={slug} />
          </Suspense>
        </ReloadableView>
      )}

      {currentView === "kanban" && (
        <ReloadableView skeleton={skeleton}>
          <Suspense fallback={skeleton}>
            <KanbanView workspaceId={workspaceId} slug={slug} />
          </Suspense>
        </ReloadableView>
      )}

      {currentView === "gantt" && (
        <ReloadableView skeleton={skeleton}>
          <Suspense fallback={skeleton}>
            <GanttView workspaceId={workspaceId} slug={slug} />
          </Suspense>
        </ReloadableView>
      )}
    </>
  );
}
