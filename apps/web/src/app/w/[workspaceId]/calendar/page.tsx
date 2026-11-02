"use client";

import { useRef } from "react";
import { useWorkspaceLayout } from "../_components/workspace-layout-context";
import { useFillViewport } from "@/hooks/use-fill-viewport";
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
  // the whole document scrolled. useFillViewport sizes it to end where the
  // screen does, the same bottom gap as every page; the lg:h calc is only the
  // first-paint fallback. Below 56rem of content (not viewport: the sidebar
  // takes ~18rem) the agenda stacks under the calendar, so the page scrolls
  // there by design.
  const pageRef = useRef<HTMLDivElement>(null);
  useFillViewport(pageRef, { property: "height", minWidth: 896 });
  return (
    <div ref={pageRef} className="flex flex-1 min-h-0 flex-col gap-5 overflow-hidden @4xl/main:h-[calc(100svh-9rem)] animate-in fade-in duration-300">
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

      {/* empty:hidden — with no upcoming meeting the alert renders nothing, and the
          empty slot would otherwise add a second gap under the header. */}
      <div className="shrink-0 empty:hidden">
        <UpcomingMeetingAlert />
      </div>

      {/* Fixed-width agenda: a 12-col split shrank the calendar first on laptops. */}
      <div className="grid grid-cols-1 @4xl/main:grid-cols-[minmax(0,1fr)_18rem] @4xl/main:grid-rows-1 gap-5 flex-1 min-h-0">
        <div className="flex flex-col min-h-0 surface p-4 sm:p-5">
          <CalendarDashboard workspaceId={workspaceId} />
        </div>

        <div className="flex flex-col min-h-0 surface p-4 sm:p-5">
          <TodayAgendaWidget />
        </div>
      </div>
    </div>
  );
}
