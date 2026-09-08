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
  Plus,
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
    openScheduleModal,
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

  const headerTitle = selectedDate.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-4">
      {/* Calendar Control Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-4 rounded-2xl border bg-card text-card-foreground shadow-xs">
        {/* Date Title & Prev/Today/Next Navigation */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrev}
              className="size-8 p-0 rounded-xl"
              title="Previous"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleToday}
              className="h-8 px-3 rounded-xl text-xs font-semibold"
            >
              Today
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleNext}
              className="size-8 p-0 rounded-xl"
              title="Next"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>

          <h2 className="text-lg sm:text-xl font-bold text-foreground min-w-[170px]">
            {headerTitle}
          </h2>
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
              className="h-8 pl-8 text-xs rounded-xl"
            />
          </div>

          {/* Meeting Type filter */}
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="h-8 text-xs rounded-xl w-32">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="ALL">All Types</SelectItem>
              <SelectItem value="INTERNAL">Internal</SelectItem>
              <SelectItem value="CLIENT">Client</SelectItem>
              <SelectItem value="PROJECT_REVIEW">Review</SelectItem>
              <SelectItem value="ONE_ON_ONE">1-on-1</SelectItem>
              <SelectItem value="GENERAL">General</SelectItem>
            </SelectContent>
          </Select>

          {/* View Mode Switcher */}
          <div className="flex items-center p-1 rounded-xl bg-muted border text-xs">
            {(["month", "week", "agenda"] as CalendarViewMode[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setActiveView(v)}
                className={`px-3 py-1 rounded-lg font-semibold capitalize transition-all ${
                  activeView === v
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {v}
              </button>
            ))}
          </div>

          {/* Schedule Meeting Primary Action */}
          <Button
            size="sm"
            onClick={() => openScheduleModal()}
            className="rounded-xl font-semibold gap-1.5 shadow-sm h-8 px-3.5 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="size-3.5" />
            Schedule Meeting
          </Button>
        </div>
      </div>

      {/* ERP Calendar Layer Toggles */}
      <div className="flex items-center gap-2 flex-wrap px-1">
        <span className="text-xs font-semibold text-muted-foreground mr-1 uppercase tracking-wider">
          Layers:
        </span>

        {/* Meetings Layer */}
        <button
          type="button"
          onClick={() => toggleLayer("meetings")}
          className={`text-xs px-2.5 py-1 rounded-xl font-medium border transition-all flex items-center gap-1.5 ${
            activeLayers.meetings
              ? "bg-primary/10 text-primary border-primary/30"
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
          className={`text-xs px-2.5 py-1 rounded-xl font-medium border transition-all flex items-center gap-1.5 ${
            activeLayers.tasks
              ? "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/30"
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
          className={`text-xs px-2.5 py-1 rounded-xl font-medium border transition-all flex items-center gap-1.5 ${
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
          className={`text-xs px-2.5 py-1 rounded-xl font-medium border transition-all flex items-center gap-1.5 ${
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
      {activeView === "month" && <CalendarMonthView />}
      {activeView === "week" && <CalendarWeekView />}
      {activeView === "agenda" && <CalendarAgendaView />}

      {/* Modals */}
      <ScheduleMeetingDialog workspaceId={workspaceId} />
      <MeetingDetailsDialog workspaceId={workspaceId} />
    </div>
  );
}
