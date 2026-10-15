"use client";

import { useWorkspaceLayout } from "./_components/workspace-layout-context";
import { BroadcastTicker, BroadcastWidget } from "./_components/broadcast-widget";
import { MyTasksWidget } from "./_components/my-tasks-widget";
import { MeetingsWidget } from "./_components/meetings-widget";
import { BirthdaysWidget } from "./_components/birthdays-widget";
import { ReviewsWidget } from "./_components/reviews-widget";
import { WorkloadWidget } from "./_components/workload-widget";
import { authClient } from "@/lib/auth-client";
import { getUserDisplayName } from "@tusker/core/lib/user-display-name";
import { CalendarDays } from "lucide-react";

export default function WorkSpacePage() {
  const { data, workspaceId } = useWorkspaceLayout();
  const { data: session } = authClient.useSession();

  const currentWorkspace = data?.workspaces?.workspaces?.[0];
  const workspaceName = currentWorkspace?.name ?? "Workspace";
  const canBroadcast = Boolean(data?.permissions?.isWorkspaceAdmin);
  // Same gate as the Team page's Tasks Assigned column.
  const canSeeWorkload = canBroadcast || data?.permissions?.workspaceRole === "MANAGER";

  const user = session?.user;
  const displayName = user ? getUserDisplayName(user as any) : "Team";

  // "Thu - Sep - 2026", as the design's date pill reads.
  const now = new Date();
  const formattedToday = [
    now.toLocaleDateString("en-US", { weekday: "short" }),
    now.toLocaleDateString("en-US", { month: "short" }),
    now.getFullYear(),
  ].join(" - ");

  return (
    <div className="space-y-6 pb-10 animate-in fade-in duration-300">
      <BroadcastTicker
        key={`ticker-${workspaceId}`}
        workspaceId={workspaceId}
        initialBroadcasts={data?.broadcasts}
      />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Welcome, {displayName}
          </h1>
          <p className="text-sm text-foreground/80">
            Announcements, your tasks and this week&apos;s meetings across {workspaceName}.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-white/70 bg-card px-4 py-2 text-sm shadow-md dark:border-border">
          <CalendarDays className="size-4" />
          {formattedToday}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        {canBroadcast && (
          <BroadcastWidget
            key={`broadcast-${workspaceId}`}
            workspaceId={workspaceId}
            canBroadcast={canBroadcast}
            initialBroadcasts={data?.broadcasts}
          />
        )}
        <MyTasksWidget key={`tasks-${workspaceId}`} workspaceId={workspaceId} />
        <MeetingsWidget key={`meetings-${workspaceId}`} workspaceId={workspaceId} />
        <ReviewsWidget key={`reviews-${workspaceId}`} workspaceId={workspaceId} />
        {canSeeWorkload && <WorkloadWidget key={`workload-${workspaceId}`} workspaceId={workspaceId} />}
        <div className="lg:col-span-3">
          <BirthdaysWidget key={`birthdays-${workspaceId}`} workspaceId={workspaceId} />
        </div>
      </div>
    </div>
  );
}
