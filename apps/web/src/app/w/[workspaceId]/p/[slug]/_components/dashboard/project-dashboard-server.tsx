import { ProjectService } from "@tusker/core/server/services/project/index";
import { requireUser } from "@/lib/auth/require-user";
import { ProjectDashboard } from "./project-dashboard";

interface ProjectDashboardServerProps {
  workspaceId: string;
  slug: string;
}

export async function ProjectDashboardServer({ workspaceId, slug }: ProjectDashboardServerProps) {
  const currentUser = await requireUser();
  const data = await ProjectService.getProjectDashboardData(workspaceId, slug, currentUser.id);
  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        Project not found.
      </div>
    );
  }

  return <ProjectDashboard data={data} workspaceId={workspaceId} />;
}
