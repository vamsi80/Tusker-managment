"use client";

import { useWorkspaceLayout } from "./workspace-layout-context";

export function WorkspaceWelcome() {
    const { data } = useWorkspaceLayout();
    const workspaceName = data?.workspaces?.workspaces?.[0]?.name ?? "Workspace";

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
