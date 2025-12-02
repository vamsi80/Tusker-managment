import React from "react";
import { notFound } from "next/navigation";
import { getUserWorkspaces } from "@/app/data/workspace/get-user-workspace";
import { requireUser } from "@/app/data/user/require-user";

type Props = {
  params: { workspaceId: string };
};

export default async function WorkSpacePage({ params }: Props) {
  const { workspaceId } = await params;
  const session = await requireUser();
  const userWorkspaces = await getUserWorkspaces(session.id);

  if (!userWorkspaces?.workspaces?.length) {
    return notFound();
  }

  const matched = userWorkspaces.workspaces.find((w) => w.workspaceId === workspaceId);
  if (!matched) {
    return notFound();
  }

  return (
    <div>
      welcome to dashboard
    </div>
  );
}
