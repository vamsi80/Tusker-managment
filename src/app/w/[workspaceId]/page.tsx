"use client";

import { useWorkspaceLayout } from "./_components/workspace-layout-context";

export default function WorkSpacePage() {
  const { data, workspaceId } = useWorkspaceLayout();
  const currentWorkspace = data?.workspaces?.workspaces?.find((w: any) => w.id === workspaceId);
  const workspaceName = currentWorkspace?.name ?? "Workspace";

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold tracking-tight">
        Welcome to {workspaceName}
      </h1>
      <p className="text-muted-foreground text-lg">
        This is your central hub for projects, tasks, and team collaboration.
      </p>
    </div>
  );
}
