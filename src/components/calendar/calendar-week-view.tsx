"use client";

import { useMemo, useState, useEffect } from "react";
import { useMeetingStore } from "@/lib/store/meeting-store";
import { Badge } from "@/components/ui/badge";
import { Clock, Video } from "lucide-react";
import type { MeetingUI } from "@/lib/api-client/meetings";

const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
const HOUR_HEIGHT = 60; // px per hour slot

export function CalendarWeekView() {
  const { selectedDate, meetings, openScheduleModal, openDetailsModal } = useMeetingStore();

  // Current time state for red line indicator
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // Compute the 7 days of the selected week (starting Sunday)
  const weekDays = useMemo(() => {
    const curr = new Date(selectedDate);
    const dayOfWeek = curr.getDay(); // 0 = Sun
    const startOfWeek = new Date(curr);
    startOfWeek.setDate(curr.getDate() - dayOfWeek);
    startOfWeek.setHours(0, 0, 0, 0);

    const todayStr = new Date().toISOString().split("T")[0];

    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      const dateKey = d.toISOString().split("T")[0];

      return {
        date: d,
        dateKey,
        dayName: d.toLocaleDateString("en-US", { weekday: "short" }),
        dayNum: d.getDate(),
        isToday: dateKey === todayStr,
      };
    });
  }, [selectedDate]);

  // Group meetings by dayKey
  const meetingsByDay = useMemo(() => {
    const map = new Map<string, MeetingUI[]>();
    weekDays.forEach((wd) => map.set(wd.dateKey, []));

    meetings.forEach((m) => {
      if (m.status === "CANCELLED") return;
      const key = new Date(m.startTime).toISOString().split("T")[0];
      if (map.has(key)) {
        map.get(key)!.push(m);
      }
    });

    return map;
  }, [meetings, weekDays]);

  // Compute live current time offset
  const currentHour = currentTime.getHours();
  const currentMinute = currentTime.getMinutes();
  const showCurrentTimeLine = currentHour >= 8 && currentHour <= 20;
  const currentTimeTop = ((currentHour - 8) * 60 + currentMinute) * (HOUR_HEIGHT / 60);

  return (
    <div className="flex flex-col border rounded-2xl bg-card overflow-hidden shadow-xs">
      {/* Week Header */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b bg-muted/30">
        <div className="py-3 text-center text-xs font-semibold text-muted-foreground border-r border-border/50">
          <Clock className="size-3.5 mx-auto" />
        </div>
        {weekDays.map((wd) => (
          <div
            key={wd.dateKey}
            className={`py-2.5 px-2 text-center border-r border-border/50 last:border-r-0 ${
              wd.isToday ? "bg-primary/5" : ""
            }`}
          >
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground block">
              {wd.dayName}
            </span>
            <span
              className={`text-sm font-bold inline-flex items-center justify-center size-7 rounded-full mt-0.5 ${
                wd.isToday ? "bg-primary text-primary-foreground shadow-xs" : "text-foreground"
              }`}
            >
              {wd.dayNum}
            </span>
          </div>
        ))}
      </div>

      {/* Hourly Timeline Grid */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] max-h-[600px] overflow-y-auto relative">
        {/* Time labels column */}
        <div className="border-r border-border/50 select-none">
          {HOURS.map((h) => {
            const label =
              h === 12
                ? "12 PM"
                : h > 12
                ? `${h - 12} PM`
                : `${h} AM`;

            return (
              <div
                key={h}
                style={{ height: HOUR_HEIGHT }}
                className="text-[10px] font-medium text-muted-foreground text-right pr-2 pt-1 border-b border-border/30"
              >
                {label}
              </div>
            );
          })}
        </div>

        {/* 7 Day Columns */}
        {weekDays.map((wd) => {
          const dayMeetings = meetingsByDay.get(wd.dateKey) || [];

          return (
            <div
              key={wd.dateKey}
              className={`relative border-r border-border/50 last:border-r-0 ${
                wd.isToday ? "bg-primary/[0.02]" : ""
              }`}
            >
              {/* Hour slot guidelines & click to schedule */}
              {HOURS.map((h) => {
                const hourStr = String(h).padStart(2, "0");
                return (
                  <div
                    key={h}
                    style={{ height: HOUR_HEIGHT }}
                    onClick={() =>
                      openScheduleModal({
                        date: wd.date,
                        time: `${hourStr}:00`,
                      })
                    }
                    className="border-b border-border/30 hover:bg-muted/30 transition-colors cursor-pointer"
                    title={`Click to schedule at ${hourStr}:00 on ${wd.dayName}`}
                  />
                );
              })}

              {/* Current Time Red Indicator Line */}
              {wd.isToday && showCurrentTimeLine && (
                <div
                  style={{ top: currentTimeTop }}
                  className="absolute left-0 right-0 z-20 flex items-center pointer-events-none"
                >
                  <div className="size-2 rounded-full bg-rose-500 -ml-1 ring-2 ring-background" />
                  <div className="h-[2px] w-full bg-rose-500 shadow-xs" />
                </div>
              )}

              {/* Meeting Cards positioned absolutely */}
              {dayMeetings.map((m) => {
                const start = new Date(m.startTime);
                const end = new Date(m.endTime);

                const startH = start.getHours() + start.getMinutes() / 60;
                const endH = end.getHours() + end.getMinutes() / 60;

                // Clamp to visible 8am-8pm range
                const clampedStart = Math.max(8, startH);
                const clampedEnd = Math.min(21, endH);
                const duration = Math.max(0.4, clampedEnd - clampedStart);

                const topPx = (clampedStart - 8) * HOUR_HEIGHT;
                const heightPx = Math.max(26, duration * HOUR_HEIGHT - 2);

                return (
                  <div
                    key={m.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      openDetailsModal(m);
                    }}
                    style={{
                      top: topPx,
                      height: heightPx,
                    }}
                    className="absolute left-1 right-1 z-10 p-1.5 rounded-lg bg-primary text-primary-foreground border border-primary/20 shadow-xs cursor-pointer hover:opacity-95 transition-all overflow-hidden flex flex-col justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        {m.meetingUrl && <Video className="size-2.5 shrink-0 opacity-80" />}
                        <span className="text-[11px] font-semibold truncate leading-tight">
                          {m.title}
                        </span>
                      </div>
                      <span className="text-[9px] opacity-80 block truncate">
                        {start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} –{" "}
                        {end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>

                    {heightPx > 45 && m.location && (
                      <span className="text-[9px] opacity-75 truncate block">
                        📍 {m.location}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
