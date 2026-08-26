import { requireUser } from "@/lib/auth/require-user";
import { IndentsClient } from "../_components/indents-client";
import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{
    workspaceId: string;
  }>;
}

export default async function WorkspaceProcurementIndents({ params }: PageProps) {
  const { workspaceId } = await params;
  const user = await requireUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <IndentsClient workspaceId={workspaceId} />
  );
}
