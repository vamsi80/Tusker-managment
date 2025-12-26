import React from "react";
import { notFound } from "next/navigation";
import { getWorkspaces } from "@/data/workspace/get-workspaces";

type Props = {
  params: { workspaceId: string };
};

export default async function WorkSpacePage({ params }: Props) {
  const { workspaceId } = await params;
  const { workspaces } = await getWorkspaces();

  if (!workspaces?.length) {
    return notFound();
  }

  const matched = workspaces.find((w) => w.id === workspaceId);
  if (!matched) {
    return notFound();
  }

  return (
    <div>
      welcome to dashboard {matched.name}
    </div>
  );
}
