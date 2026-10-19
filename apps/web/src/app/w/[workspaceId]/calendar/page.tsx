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

  // The shell grows with its content, so flex-1 alone never capped this page and
  // the whole document scrolled. 9rem = site header (77px) + shell padding (56px)
  // with a little slack. Below lg the agenda stacks under the calendar, so the
  // page scrolls there by design.
  return (
    <div className="flex flex-1 min-h-0 flex-col gap-6 overflow-hidden lg:h-[calc(100svh-9rem)] animate-in fade-in duration-300">
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

      <div className="grid grid-cols-1 lg:grid-cols-12 lg:grid-rows-1 gap-6 flex-1 min-h-0">
        <div className="lg:col-span-8 xl:col-span-9 flex flex-col min-h-0 surface p-4 sm:p-5">
          <CalendarDashboard workspaceId={workspaceId} />
        </div>

        <div className="lg:col-span-4 xl:col-span-3 flex flex-col min-h-0 surface p-4">
          <TodayAgendaWidget />
        </div>
      </div>
    </div>
  );
}
