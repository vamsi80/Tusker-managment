import { requireUser } from "@/lib/auth/require-user";
import { DashboardClient } from "./_components/dashboard-client";
import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{
    workspaceId: string;
  }>;
}

export default async function WorkspaceProcurementDashboard({ params }: PageProps) {
  const { workspaceId } = await params;
  const user = await requireUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <DashboardClient workspaceId={workspaceId} />
  );
}