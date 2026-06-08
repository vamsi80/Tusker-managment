import { Suspense } from "react";
import { requireUser } from "@/lib/auth/require-user";
import { AppLoader } from "@/components/shared/app-loader";
import { serverApiFetch } from "@/lib/api-client/server-fetch";

interface iAppProps {
  params: Promise<{ workspaceId: string; slug: string }>;
}

export default async function KanbanPage({ params }: iAppProps) {
  const { workspaceId, slug } = await params;
  const loader = <AppLoader />;

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      <Suspense fallback={loader}>
        <ProjectKanbanViewServer workspaceId={workspaceId} slug={slug} />
      </Suspense>
    </div>
  );
}

async function ProjectKanbanViewServer({ workspaceId, slug }: { workspaceId: string; slug: string }) {
    const [project, user] = await Promise.all([
        serverApiFetch<{ success: boolean; data: { id: string } }>(
            `/projects/slug/${slug}/metadata?workspaceId=${workspaceId}`
        ).then(r => r.data).catch(() => null),
        requireUser(),
    ]);
    if (!project) return null;
    const { ProjectKanbanView } = await import("../_components/kanban/project-kanban-view");
    return <ProjectKanbanView workspaceId={workspaceId} projectId={project.id} userId={user.id} />;
}
