import React from "react";
import { getWorkspaceMetadata } from "@/data/workspace/get-workspace-metadata";

type Props = {
  params: Promise<{ workspaceId: string }>;
};

export default async function WorkSpacePage({ params }: Props) {
  const { workspaceId } = await params;

  // Uses cached metadata from the layout's WorkspaceAccessGuard — zero extra DB calls
  const workspace = await getWorkspaceMetadata(workspaceId);

  return (
    <div>
      welcome to dashboard {workspace?.name ?? "Workspace"}
    </div>
  );
}
