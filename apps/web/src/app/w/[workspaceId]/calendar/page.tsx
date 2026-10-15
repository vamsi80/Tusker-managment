"use client";

import { useWorkspaceLayout } from "../_components/workspace-layout-context";
import { CalendarDashboard } from "@/components/calendar/calendar-dashboard";
import { UpcomingMeetingAlert } from "@/components/calendar/upcoming-meeting-alert";
import { TodayAgendaWidget } from "@/components/calendar/today-agenda-widget";
import { Button } from "@/components/ui/button";
import { useMeetingStore } from "@/lib/store/meeting-store";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";

export default function CalendarPage() {
  const { workspaceId } = useWorkspaceLayout();
  const { openScheduleModal } = useMeetingStore();

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-6 overflow-hidden animate-in fade-in duration-300">
      <PageHeader
        className="shrink-0"
        title="Schedule & Meetings"
        description="Meetings, task deadlines, holidays and team leaves in one view."
        actions={
          <Button variant="outline" onClick={() => openScheduleModal()} className="shadow-md">
            <Plus className="size-4" /> Schedule Meeting
          </Button>
        }
      />

      <div className="shrink-0">
        <UpcomingMeetingAlert />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 flex-1 min-h-0">
        <div className="xl:col-span-9 flex flex-col min-h-0 surface p-4 sm:p-5">
          <CalendarDashboard workspaceId={workspaceId} />
        </div>

        <div className="xl:col-span-3 flex flex-col min-h-0 surface p-4">
          <TodayAgendaWidget />
        </div>
      </div>
    </div>
  );
}
