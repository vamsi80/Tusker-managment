import { serverApiFetch } from "@/lib/api-client/server-fetch";
import { ProjectDashboard } from "./project-dashboard";

interface ProjectDashboardServerProps {
  workspaceId: string;
  slug: string;
}

export async function ProjectDashboardServer({ workspaceId, slug }: ProjectDashboardServerProps) {
  const res = await serverApiFetch<{ success: boolean; data: Record<string, unknown> }>(
    `/projects/slug/${slug}/dashboard?workspaceId=${workspaceId}`
  ).catch(() => null);

  const data = res?.data ?? null;

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        Project not found.
      </div>
    );
  }

  return <ProjectDashboard data={data} workspaceId={workspaceId} />;
}
