"use client";

import { useWorkspaceLayout } from "./_components/workspace-layout-context";
import { BirthdaysWidget } from "./_components/birthdays-widget";
import { CalendarDashboard } from "@/components/calendar/calendar-dashboard";
import { UpcomingMeetingAlert } from "@/components/calendar/upcoming-meeting-alert";
import { TodayAgendaWidget } from "@/components/calendar/today-agenda-widget";
import { authClient } from "@/lib/auth-client";
import { getUserDisplayName } from "@/lib/user-display-name";
import { Button } from "@/components/ui/button";
import { useMeetingStore } from "@/lib/store/meeting-store";
import { Plus, Calendar as CalendarIcon, Sparkles } from "lucide-react";

export default function WorkSpacePage() {
  const { data, workspaceId } = useWorkspaceLayout();
  const { data: session } = authClient.useSession();
  const { openScheduleModal } = useMeetingStore();

  const currentWorkspace = data?.workspaces?.workspaces?.[0];
  const workspaceName = currentWorkspace?.name ?? "Workspace";

  const user = session?.user;
  const displayName = user ? getUserDisplayName(user as any) : "Team";

  const today = new Date();
  const formattedToday = today.toLocaleDateString("en-US", {
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
            Manage your schedule, meetings, and team collaboration across {workspaceName}.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <Button
            onClick={() => openScheduleModal()}
            className="rounded-2xl font-semibold gap-2 shadow-sm h-10 px-4 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="size-4" /> Schedule Meeting
          </Button>
        </div>
      </div>

      {/* Proactive Upcoming Meeting Alert (Intimation) */}
      <UpcomingMeetingAlert />

      {/* Main ERP Calendar & Side Agenda Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left Column: Interactive Multi-Layer Calendar (8 cols) */}
        <div className="xl:col-span-8 space-y-6">
          <CalendarDashboard workspaceId={workspaceId} />
        </div>

        {/* Right Column: Today's Agenda & Widgets (4 cols) */}
        <div className="xl:col-span-4 space-y-6">
          <TodayAgendaWidget />
          <BirthdaysWidget workspaceId={workspaceId} />
        </div>
      </div>
    </div>
  );
}
