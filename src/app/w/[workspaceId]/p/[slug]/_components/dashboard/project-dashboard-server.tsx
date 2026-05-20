import { ProjectService } from "@/server/services/project";
import { ProjectDashboard } from "./project-dashboard";

interface ProjectDashboardServerProps {
  workspaceId: string;
  slug: string;
}

export async function ProjectDashboardServer({ workspaceId, slug }: ProjectDashboardServerProps) {
  const data = await ProjectService.getProjectDashboardData(workspaceId, slug);
  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        Project not found.
      </div>
    );
  }

  return <ProjectDashboard data={data} workspaceId={workspaceId} />;
}
