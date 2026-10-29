"use client";

import { useEffect } from "react";
import { useMeetingStore, type CalendarViewMode } from "@/lib/store/meeting-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronLeft,
  ChevronRight,
  Search,
  CheckSquare,
  Sparkles,
  UserX,
  Calendar as CalendarIcon,
  Video,
} from "lucide-react";
import { CalendarMonthView } from "./calendar-month-view";
import { CalendarWeekView } from "./calendar-week-view";
import { CalendarAgendaView } from "./calendar-agenda-view";
import { ScheduleMeetingDialog } from "./schedule-meeting-dialog";
import { MeetingDetailsDialog } from "./meeting-details-dialog";

export function CalendarDashboard({ workspaceId }: { workspaceId: string }) {
  const {
    activeView,
    setActiveView,
    selectedDate,
    setSelectedDate,
    meetings,
    taskDeadlines,
    publicHolidays,
    leaves,
    activeLayers,
    toggleLayer,
    filterType,
    setFilterType,
    searchQuery,
    setSearchQuery,
    fetchCalendarData,
    handleRealtimeSync,
  } = useMeetingStore();

  // Load calendar data
  useEffect(() => {
    if (workspaceId) {
      fetchCalendarData(workspaceId);
    }
  }, [workspaceId, fetchCalendarData]);

  // Real-time synchronization via custom window events dispatched by Pusher listener
  useEffect(() => {
    const handleMeetingSyncEvent = (e: any) => {
      if (e.detail) {
        console.log("[CALENDAR_DASHBOARD] 🔄 Real-time meeting sync event received:", e.detail.action);
        handleRealtimeSync(e.detail);
      }
    };

    const handleTaskSyncEvent = (e: any) => {
      if (e.detail && workspaceId) {
        console.log("[CALENDAR_DASHBOARD] 🔄 Real-time task sync event received:", e.detail.action);
        const record = e.detail.record;
        if (
          record?.id &&
          (record.status === "COMPLETED" ||
            record.status === "CANCELLED" ||
            e.detail.action?.includes("DELETE"))
        ) {
          useMeetingStore.setState((state) => ({
            taskDeadlines: state.taskDeadlines.filter((t) => t.id !== record.id),
          }));
        }
        fetchCalendarData(workspaceId);
      }
    };

    window.addEventListener("realtime-meeting-sync", handleMeetingSyncEvent);
    window.addEventListener("realtime-task-sync", handleTaskSyncEvent);
    return () => {
      window.removeEventListener("realtime-meeting-sync", handleMeetingSyncEvent);
      window.removeEventListener("realtime-task-sync", handleTaskSyncEvent);
    };
  }, [handleRealtimeSync, fetchCalendarData, workspaceId]);

  // Date Navigation handlers
  const handlePrev = () => {
    const next = new Date(selectedDate);
    if (activeView === "month") {
      next.setMonth(next.getMonth() - 1);
    } else if (activeView === "week") {
      next.setDate(next.getDate() - 7);
    } else {
      next.setDate(next.getDate() - 1);
    }
    setSelectedDate(next);
  };

  const handleNext = () => {
    const next = new Date(selectedDate);
    if (activeView === "month") {
      next.setMonth(next.getMonth() + 1);
    } else if (activeView === "week") {
      next.setDate(next.getDate() + 7);
    } else {
      next.setDate(next.getDate() + 1);
    }
    setSelectedDate(next);
  };

  const handleToday = () => {
    setSelectedDate(new Date());
  };

  // The week view moves in weeks, so a month-and-year title was simply the
  // wrong period: it sat on "September" while the grid showed Sep 28 - Oct 4.
  const headerTitle = (() => {
    if (activeView !== "week") {
      return selectedDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    }

    const start = new Date(selectedDate);
    start.setDate(start.getDate() - start.getDay());
    const end = new Date(start);
    end.setDate(start.getDate() + 6);

    const startLabel = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const endLabel = end.toLocaleDateString("en-US", {
      // Only repeat the month when the week straddles two of them.
      ...(start.getMonth() === end.getMonth() ? {} : { month: "short" }),
      day: "numeric",
    });

    return `${startLabel} – ${endLabel}, ${end.getFullYear()}`;
  })();

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-4">
      {/* Calendar Control Bar */}
      <div className="shrink-0 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* Today, then prev/next flanking the period they move */}
        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={handleToday}
            className="h-8 px-3 text-xs font-semibold"
          >
            Today
          </Button>

          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrev}
              className="size-8 p-0 shadow-sm"
              title="Previous"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <h2 className="text-xl sm:text-2xl font-bold text-foreground text-center min-w-[190px]">
              {headerTitle}
            </h2>
            <Button
              variant="outline"
              size="sm"
              onClick={handleNext}
              className="size-8 p-0 shadow-sm"
              title="Next"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>

        {/* Center: Search and Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="relative w-full sm:w-44">
            <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search meetings..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-8 text-xs rounded-full"
            />
          </div>

          {/* Meeting Type filter */}
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger size="sm" className="text-xs w-32">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Types</SelectItem>
              <SelectItem value="INTERNAL">Internal</SelectItem>
              <SelectItem value="CLIENT">Client</SelectItem>
              <SelectItem value="PROJECT_REVIEW">Review</SelectItem>
              <SelectItem value="ONE_ON_ONE">1-on-1</SelectItem>
              <SelectItem value="GENERAL">General</SelectItem>
            </SelectContent>
          </Select>

          {/* View Mode Switcher */}
          <div className="flex items-center p-1 rounded-full bg-muted text-xs">
            {(["month", "week", "agenda"] as CalendarViewMode[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setActiveView(v)}
                className={`px-3.5 py-1.5 rounded-full font-semibold capitalize transition-all ${
                  activeView === v
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {v}
              </button>
            ))}
          </div>

        </div>
      </div>

      {/* ERP Calendar Layer Toggles */}
      <div className="shrink-0 flex items-center gap-2 flex-wrap px-1">
        <span className="text-xs font-semibold text-muted-foreground mr-1 uppercase tracking-wider">
          Layers:
        </span>

        {/* Meetings Layer */}
        <button
          type="button"
          onClick={() => toggleLayer("meetings")}
          className={`text-xs px-3 py-1 rounded-full font-medium border transition-all flex items-center gap-1.5 ${
            activeLayers.meetings
              ? "bg-primary/10 text-primary-ink border-primary-ink/30"
              : "bg-muted/40 text-muted-foreground/60 border-transparent hover:border-border"
          }`}
        >
          <Video className="size-3" />
          Meetings
          <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">
            {meetings.length}
          </Badge>
        </button>

        {/* Task Due Dates Layer */}
        <button
          type="button"
          onClick={() => toggleLayer("tasks")}
          className={`text-xs px-3 py-1 rounded-full font-medium border transition-all flex items-center gap-1.5 ${
            activeLayers.tasks
              ? "bg-[#4D4DFF]/10 text-[#4D4DFF] border-[#4D4DFF]/30 dark:bg-[#4D4DFF]/20 dark:text-[#8080FF]"
              : "bg-muted/40 text-muted-foreground/60 border-transparent hover:border-border"
          }`}
        >
          <CheckSquare className="size-3" />
          Task Deadlines
          <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">
            {taskDeadlines.length}
          </Badge>
        </button>

        {/* Public Holidays Layer */}
        <button
          type="button"
          onClick={() => toggleLayer("holidays")}
          className={`text-xs px-3 py-1 rounded-full font-medium border transition-all flex items-center gap-1.5 ${
            activeLayers.holidays
              ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30"
              : "bg-muted/40 text-muted-foreground/60 border-transparent hover:border-border"
          }`}
        >
          <Sparkles className="size-3" />
          Public Holidays
          <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">
            {publicHolidays.length}
          </Badge>
        </button>

        {/* Team Leaves Layer */}
        <button
          type="button"
          onClick={() => toggleLayer("leaves")}
          className={`text-xs px-3 py-1 rounded-full font-medium border transition-all flex items-center gap-1.5 ${
            activeLayers.leaves
              ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30"
              : "bg-muted/40 text-muted-foreground/60 border-transparent hover:border-border"
          }`}
        >
          <UserX className="size-3" />
          Leaves
          <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">
            {leaves.length}
          </Badge>
        </button>
      </div>

      {/* Main View Area */}
      <div className="flex-1 min-h-0">
        {activeView === "month" && <CalendarMonthView />}
        {activeView === "week" && <CalendarWeekView />}
        {activeView === "agenda" && <CalendarAgendaView />}
      </div>

      {/* Modals */}
      <ScheduleMeetingDialog workspaceId={workspaceId} />
      <MeetingDetailsDialog workspaceId={workspaceId} />
    </div>
  );
}
