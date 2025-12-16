import React from "react";
import { notFound } from "next/navigation";
import { requireUser } from "@/data/user/require-user";
import { getUserWorkspaces } from "@/data/user/get-user-workspace";

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
