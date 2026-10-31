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
        <div className="flex items-center gap-2 glass rounded-full px-4 py-2 text-sm">
          <CalendarDays className="size-4" />
          {formattedToday}
        </div>
      </div>

      {/* Columns come from the space actually available, not the viewport:
          `lg:` ignored the sidebar, so at 150% OS scaling (about 1280px) three
          columns squeezed each card to ~300px and text spilled out. Each card
          now gets at least 22rem or the grid drops a column; min-w-0 lets a
          card shrink to its track instead of overflowing it. */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,22rem),1fr))] gap-6 items-stretch [&>*]:min-w-0">
        <ReviewsWidget key={`reviews-${workspaceId}`} workspaceId={workspaceId} />
        <MyTasksWidget key={`tasks-${workspaceId}`} workspaceId={workspaceId} />
        <MeetingsWidget key={`meetings-${workspaceId}`} workspaceId={workspaceId} />
        {canBroadcast && (
          <BroadcastWidget
            key={`broadcast-${workspaceId}`}
            workspaceId={workspaceId}
            canBroadcast={canBroadcast}
            initialBroadcasts={data?.broadcasts}
          />
        )}
        {canSeeWorkload && <WorkloadWidget key={`workload-${workspaceId}`} workspaceId={workspaceId} />}
        <BirthdaysWidget key={`birthdays-${workspaceId}`} workspaceId={workspaceId} />
      </div>
    </div>
  );
}
