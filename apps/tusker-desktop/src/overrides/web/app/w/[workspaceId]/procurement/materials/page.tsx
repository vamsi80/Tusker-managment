// Desktop copy of apps/web/src/app/w/[workspaceId]/procurement/materials/page.tsx: identical except the inline prisma
// queries, which run on the API (apps/api .../routes/desktop.ts) unchanged.
import { requireUser } from "@/lib/auth/require-user";
import { MaterialsHubClient } from "@/app/w/[workspaceId]/procurement/_components/materials-hub-client";
import { redirect } from "next/navigation";
import { api } from "~/overrides/web/lib/desktop-api";

interface PageProps {
  params: Promise<{
    workspaceId: string;
  }>;
}

export default async function WorkspaceProcurementMaterials({ params }: PageProps) {
  const { workspaceId } = await params;
  const user = await requireUser();

  if (!user) {
    redirect("/login");
  }

  const projects = await api<{ id: string; name: string; slug: string }[]>("/desktop/procurement/projects", { query: { workspaceId } });

  return (
    <MaterialsHubClient workspaceId={workspaceId} projects={projects} />
  );
}
