import { requireUser } from "@/lib/auth/require-user";
import { RfqsClient } from "../_components/rfqs-client";
import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{
    workspaceId: string;
  }>;
}

export default async function WorkspaceProcurementRfqs({ params }: PageProps) {
  const { workspaceId } = await params;
  const user = await requireUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <RfqsClient workspaceId={workspaceId} />
  );
}
