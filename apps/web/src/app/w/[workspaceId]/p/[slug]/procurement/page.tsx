import { Suspense } from "react";
import { ProjectService } from "@tusker/core/server/services/project/index";
import { requireUser } from "@/lib/auth/require-user";
import { AppLoader } from "@/components/shared/app-loader";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";
import { redirect } from "next/navigation";

interface iAppProps {
  params: Promise<{ workspaceId: string; slug: string }>;
}

export default async function ProcurementPage({ params }: iAppProps) {
  const { workspaceId, slug } = await params;
  const loader = <AppLoader />;

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      <Suspense fallback={loader}>
        <ProjectProcurementViewServer workspaceId={workspaceId} slug={slug} />
      </Suspense>
    </div>
  );
}

async function ProjectProcurementViewServer({ workspaceId, slug }: { workspaceId: string, slug: string }) {
  const [project, user] = await Promise.all([ProjectService.getProjectBySlug(workspaceId, slug), requireUser()]);
  if (!project) return null;

  // Same Settings -> Permissions gate as the workspace Procurement section.
  const permissions = await getWorkspacePermissions(workspaceId, user.id, true);
  if (!permissions.capabilities?.["procurement:view"]) {
    redirect(`/w/${workspaceId}/p/${slug}`);
  }

  const { ProjectProcurementView } = await import("./_components/project-procurement-view");
  return <ProjectProcurementView workspaceId={workspaceId} projectId={project.id} userId={user.id} />;
}
