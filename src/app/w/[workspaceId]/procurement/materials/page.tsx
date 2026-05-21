import { requireUser } from "@/lib/auth/require-user";
import db from "@/lib/db";
import { MaterialsHubClient } from "../_components/materials-hub-client";
import { redirect } from "next/navigation";

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

  const projects = await db.project.findMany({
    where: { workspaceId },
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" },
  });

  return (
    <MaterialsHubClient workspaceId={workspaceId} projects={projects} />
  );
}
