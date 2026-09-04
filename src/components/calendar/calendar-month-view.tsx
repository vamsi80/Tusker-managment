"use client";

import { useMemo } from "react";
import { useMeetingStore } from "@/lib/store/meeting-store";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, CheckSquare, Sparkles, UserX, Video } from "lucide-react";
import type { MeetingUI } from "@/lib/api-client/meetings";

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function CalendarMonthView() {
  const {
    selectedDate,
    meetings,
    taskDeadlines,
    publicHolidays,
    leaves,
    activeLayers,
    filterType,
    searchQuery,
    openScheduleModal,
    openDetailsModal,
  } = useMeetingStore();

  // Calendar days generation
  const { days, monthLabel } = useMemo(() => {
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const startingDayIndex = firstDay.getDay(); // 0 = Sun
    const totalDays = lastDay.getDate();

    const daysArray: Array<{
      date: Date;
      isCurrentMonth: boolean;
      isToday: boolean;
      dateKey: string;
    }> = [];

    const todayKey = new Date().toISOString().split("T")[0];

    // Previous month padding days
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startingDayIndex - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, prevMonthLastDay - i);
      const dateKey = d.toISOString().split("T")[0];
      daysArray.push({
        date: d,
        isCurrentMonth: false,
        isToday: dateKey === todayKey,
        dateKey,
      });
    }

    // Current month days
    for (let i = 1; i <= totalDays; i++) {
      const d = new Date(year, month, i);
      const dateKey = d.toISOString().split("T")[0];
      daysArray.push({
        date: d,
        isCurrentMonth: true,
        isToday: dateKey === todayKey,
        dateKey,
      });
    }

    // Next month padding days to complete 35 or 42 grid slots
    const remaining = (7 - (daysArray.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      const dateKey = d.toISOString().split("T")[0];
      daysArray.push({
        date: d,
        isCurrentMonth: false,
        isToday: dateKey === todayKey,
        dateKey,
      });
    }

    return {
      days: daysArray,
      monthLabel: selectedDate.toLocaleString("en-US", { month: "long", year: "numeric" }),
    };
  }, [selectedDate]);

  // Filter meetings by search & type
  const filteredMeetings = useMemo(() => {
    return meetings.filter((m) => {
      if (filterType !== "ALL" && m.type !== filterType) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = m.title.toLowerCase().includes(q);
        const matchesDesc = m.description?.toLowerCase().includes(q);
        const matchesLocation = m.location?.toLowerCase().includes(q);
        if (!matchesTitle && !matchesDesc && !matchesLocation) return false;
      }
      return true;
    });
  }, [meetings, filterType, searchQuery]);

  // Group items by dateKey (YYYY-MM-DD)
  const itemsByDate = useMemo(() => {
    const map = new Map<
      string,
      {
        meetings: MeetingUI[];
        tasks: typeof taskDeadlines;
        holidays: typeof publicHolidays;
        leaves: typeof leaves;
      }
    >();

    const getEntry = (key: string) => {
      if (!map.has(key)) {
        map.set(key, { meetings: [], tasks: [], holidays: [], leaves: [] });
      }
      return map.get(key)!;
    };

    if (activeLayers.meetings) {
      filteredMeetings.forEach((m) => {
        const key = new Date(m.startTime).toISOString().split("T")[0];
        getEntry(key).meetings.push(m);
      });
    }

    if (activeLayers.tasks) {
      taskDeadlines.forEach((t) => {
        const key = new Date(t.date).toISOString().split("T")[0];
        getEntry(key).tasks.push(t);
      });
    }

    if (activeLayers.holidays) {
      publicHolidays.forEach((h) => {
        const key = new Date(h.date).toISOString().split("T")[0];
        getEntry(key).holidays.push(h);
      });
    }

    if (activeLayers.leaves) {
      leaves.forEach((l) => {
        const start = new Date(l.startDate);
        const end = new Date(l.endDate);
        // Mark all dates between start and end
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          const key = d.toISOString().split("T")[0];
          getEntry(key).leaves.push(l);
        }
      });
    }

    return map;
  }, [filteredMeetings, taskDeadlines, publicHolidays, leaves, activeLayers]);

  return (
    <div className="flex flex-col border rounded-2xl bg-card overflow-hidden shadow-xs">
      {/* Day of week headers */}
      <div className="grid grid-cols-7 border-b bg-muted/30 text-xs font-semibold text-muted-foreground text-center py-2.5">
        {DAYS_OF_WEEK.map((d) => (
          <div key={d} className="tracking-wider uppercase text-[11px]">
            {d}
          </div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 auto-rows-fr divide-x divide-y border-b border-r">
        {days.map((dayItem, idx) => {
          const entry = itemsByDate.get(dayItem.dateKey);
          const dayMeetings = entry?.meetings || [];
          const dayTasks = entry?.tasks || [];
          const dayHolidays = entry?.holidays || [];
          const dayLeaves = entry?.leaves || [];

          const totalItems = dayMeetings.length + dayTasks.length + dayHolidays.length + dayLeaves.length;
          const displayItemsLimit = 3;

          return (
            <div
              key={idx}
              className={`min-h-[105px] p-2 flex flex-col group relative transition-colors ${
                dayItem.isCurrentMonth
                  ? "bg-card hover:bg-muted/15"
                  : "bg-muted/10 text-muted-foreground/50 hover:bg-muted/20"
              }`}
            >
              {/* Day header */}
              <div className="flex items-center justify-between mb-1">
                <span
                  className={`text-xs font-semibold inline-flex items-center justify-center size-6 rounded-full ${
                    dayItem.isToday
                      ? "bg-primary text-primary-foreground font-bold shadow-xs"
                      : dayItem.isCurrentMonth
                      ? "text-foreground"
                      : "text-muted-foreground/60"
                  }`}
                >
                  {dayItem.date.getDate()}
                </span>

                {/* Quick Add Button on Hover */}
                <button
                  type="button"
                  onClick={() => openScheduleModal({ date: dayItem.date })}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-primary/10 hover:text-primary transition-all text-muted-foreground"
                  title="Schedule meeting on this day"
                >
                  <Plus className="size-3.5" />
                </button>
              </div>

              {/* Items List */}
              <div className="flex-1 space-y-1 overflow-hidden">
                {/* Public Holidays */}
                {dayHolidays.slice(0, 1).map((h) => (
                  <div
                    key={h.id}
                    className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 truncate"
                    title={`Holiday: ${h.name}`}
                  >
                    <Sparkles className="size-2.5 shrink-0" />
                    <span className="truncate">{h.name}</span>
                  </div>
                ))}

                {/* Team Leaves */}
                {dayLeaves.slice(0, 1).map((l, i) => (
                  <div
                    key={`${l.id}-${i}`}
                    className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 truncate"
                    title={`On Leave: ${l.member}`}
                  >
                    <UserX className="size-2.5 shrink-0" />
                    <span className="truncate">{l.member} (Leave)</span>
                  </div>
                ))}

                {/* Meetings */}
                {dayMeetings.slice(0, displayItemsLimit).map((m) => {
                  const startTime = new Date(m.startTime).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  });

                  return (
                    <div
                      key={m.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        openDetailsModal(m);
                      }}
                      className="flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-md bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 cursor-pointer transition-colors truncate"
                      title={`${startTime} ${m.title}`}
                    >
                      {m.meetingUrl && <Video className="size-2.5 shrink-0 text-primary" />}
                      <span className="text-[10px] text-primary/80 shrink-0">{startTime}</span>
                      <span className="truncate">{m.title}</span>
                    </div>
                  );
                })}

                {/* Tasks */}
                {dayTasks.slice(0, 1).map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-slate-500/10 text-slate-600 dark:text-slate-300 border border-slate-500/20 truncate"
                    title={`Task: ${t.title}`}
                  >
                    <CheckSquare className="size-2.5 shrink-0" />
                    <span className="truncate">{t.title}</span>
                  </div>
                ))}

                {/* Overflow Popover if more items */}
                {totalItems > displayItemsLimit && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="text-[10px] font-semibold text-muted-foreground hover:text-foreground pl-1 transition-colors block"
                      >
                        +{totalItems - displayItemsLimit} more
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-3 space-y-2 rounded-xl shadow-lg">
                      <p className="text-xs font-bold text-foreground">
                        {dayItem.date.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {dayMeetings.map((m) => (
                          <div
                            key={m.id}
                            onClick={() => openDetailsModal(m)}
                            className="p-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium cursor-pointer hover:bg-primary/20 transition-colors"
                          >
                            <p className="font-semibold truncate">{m.title}</p>
                            <p className="text-[10px] opacity-80">
                              {new Date(m.startTime).toLocaleTimeString([], {
                                hour: "numeric",
                                minute: "2-digit",
                              })}
                            </p>
                          </div>
                        ))}

                        {dayTasks.map((t) => (
                          <div
                            key={t.id}
                            className="flex items-center gap-1.5 text-xs font-medium p-1.5 rounded-lg bg-slate-500/10 text-slate-700 dark:text-slate-300 border border-slate-500/20 truncate"
                            title={`Task: ${t.title}`}
                          >
                            <CheckSquare className="size-3 shrink-0 text-slate-600 dark:text-slate-400" />
                            <span className="truncate">{t.title}</span>
                          </div>
                        ))}

                        {dayHolidays.map((h) => (
                          <div
                            key={h.id}
                            className="flex items-center gap-1.5 text-xs font-medium p-1.5 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 truncate"
                            title={`Holiday: ${h.name}`}
                          >
                            <Sparkles className="size-3 shrink-0" />
                            <span className="truncate">{h.name}</span>
                          </div>
                        ))}

                        {dayLeaves.map((l, i) => (
                          <div
                            key={`${l.id}-${i}`}
                            className="flex items-center gap-1.5 text-xs font-medium p-1.5 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 truncate"
                            title={`On Leave: ${l.member}`}
                          >
                            <UserX className="size-3 shrink-0" />
                            <span className="truncate">{l.member} (Leave)</span>
                          </div>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
