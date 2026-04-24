"use client";

import { useWorkspaceLayout } from "./_components/workspace-layout-context";

export default function WorkSpacePage() {
  const { data } = useWorkspaceLayout();
  const workspaceName = data?.metadata?.name ?? "Workspace";

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
