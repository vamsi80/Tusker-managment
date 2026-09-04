"use client";

import { useWorkspaceLayout } from "../_components/workspace-layout-context";
import { CalendarDashboard } from "@/components/calendar/calendar-dashboard";
import { UpcomingMeetingAlert } from "@/components/calendar/upcoming-meeting-alert";
import { TodayAgendaWidget } from "@/components/calendar/today-agenda-widget";
import { Button } from "@/components/ui/button";
import { useMeetingStore } from "@/lib/store/meeting-store";
import { Plus, Calendar as CalendarIcon } from "lucide-react";

export default function CalendarPage() {
  const { workspaceId } = useWorkspaceLayout();
  const { openScheduleModal } = useMeetingStore();

  return (
    <div className="space-y-6 pb-10 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-3xl bg-gradient-to-br from-card via-card to-primary/5 border shadow-xs">
        <div className="space-y-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
            <CalendarIcon className="size-3.5" /> Calendar
          </span>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Schedule & Meetings
          </h1>
          <p className="text-sm text-muted-foreground">
            Meetings, task deadlines, holidays and team leaves in one view.
          </p>
        </div>

        <Button
          onClick={() => openScheduleModal()}
          className="rounded-2xl font-semibold gap-2 shadow-sm h-10 px-4 bg-primary text-primary-foreground hover:bg-primary/90 shrink-0"
        >
          <Plus className="size-4" /> Schedule Meeting
        </Button>
      </div>

      <UpcomingMeetingAlert />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className="xl:col-span-8 space-y-6">
          <CalendarDashboard workspaceId={workspaceId} />
        </div>

        <div className="xl:col-span-4 space-y-6">
          <TodayAgendaWidget />
        </div>
      </div>
    </div>
  );
}
