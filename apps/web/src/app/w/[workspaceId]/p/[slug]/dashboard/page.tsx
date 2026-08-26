import { Suspense } from "react";
import { ProjectDashboardServer } from "../_components/dashboard/project-dashboard-server";
import { AppLoader } from "@/components/shared/app-loader";

interface iAppProps {
  params: Promise<{ workspaceId: string; slug: string }>;
}

export default async function DashboardPage({ params }: iAppProps) {
  const { workspaceId, slug } = await params;
  const loader = <AppLoader />;

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      <Suspense fallback={loader}>
        <ProjectDashboardServer workspaceId={workspaceId} slug={slug} />
      </Suspense>
    </div>
  );
}
