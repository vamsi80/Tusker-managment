"use client";

import { useWorkspaceLayout } from "./_components/workspace-layout-context";
import { BroadcastWidget } from "./_components/broadcast-widget";
import { MyTasksWidget } from "./_components/my-tasks-widget";
import { MeetingsWidget } from "./_components/meetings-widget";
import { authClient } from "@/lib/auth-client";
import { getUserDisplayName } from "@/lib/user-display-name";
import { Sparkles } from "lucide-react";

export default function WorkSpacePage() {
  const { data, workspaceId } = useWorkspaceLayout();
  const { data: session } = authClient.useSession();

  const currentWorkspace = data?.workspaces?.workspaces?.[0];
  const workspaceName = currentWorkspace?.name ?? "Workspace";
  const canBroadcast = Boolean(data?.permissions?.isWorkspaceAdmin);

  const user = session?.user;
  const displayName = user ? getUserDisplayName(user as any) : "Team";

  const formattedToday = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="space-y-6 pb-10 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-3xl bg-gradient-to-br from-card via-card to-primary/5 border shadow-xs">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
              <Sparkles className="size-3.5" /> Workspace Dashboard
            </span>
            <span className="text-muted-foreground/40">•</span>
            <span className="text-xs font-medium text-muted-foreground">{formattedToday}</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Welcome, {displayName}
          </h1>

          <p className="text-sm text-muted-foreground">
            Announcements, your tasks and this week&apos;s meetings across {workspaceName}.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <BroadcastWidget
          key={`broadcast-${workspaceId}`}
          workspaceId={workspaceId}
          canBroadcast={canBroadcast}
          initialBroadcasts={data?.broadcasts}
        />
        <MyTasksWidget key={`tasks-${workspaceId}`} workspaceId={workspaceId} />
        <MeetingsWidget key={`meetings-${workspaceId}`} workspaceId={workspaceId} />
      </div>
    </div>
  );
}
