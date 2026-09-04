"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarClock, MapPin, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { apiClient } from "@/lib/api-client";
import { calendarDayKey } from "@/lib/date-utils";
import type { MeetingUI } from "@/lib/api-client/meetings";

/** Sunday 00:00 → Saturday 23:59:59 of the week containing `now`, in local time. */
function currentWeek() {
  const start = new Date();
  start.setDate(start.getDate() - start.getDay());
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

/**
 * Read-only view of the week's meetings, today's first. Scheduling lives on the
 * calendar page.
 */
export function MeetingsWidget({ workspaceId }: { workspaceId: string }) {
  const [meetings, setMeetings] = useState<MeetingUI[] | null>(null);

  const load = useCallback(() => {
    const { start, end } = currentWeek();
    apiClient.meetings
      .getMeetings({
        workspaceId,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      })
      .then((data) => setMeetings(data.meetings || []))
      .catch(() => setMeetings([]));
  }, [workspaceId]);

  useEffect(() => {
    load();
    const onSync = () => load();
    window.addEventListener("realtime-meeting-sync", onSync);
    return () => window.removeEventListener("realtime-meeting-sync", onSync);
  }, [load]);

  const todayKey = calendarDayKey(new Date());
  const active = (meetings ?? []).filter((m) => m.status !== "CANCELLED");
  const todays = active.filter((m) => calendarDayKey(m.startTime) === todayKey);
  const rest = active.filter((m) => calendarDayKey(m.startTime) !== todayKey);

  const renderMeeting = (m: MeetingUI) => {
    const start = new Date(m.startTime);
    return (
      <div key={m.id} className="py-3 first:pt-0 last:pb-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-medium text-foreground truncate">{m.title}</span>
          <span className="text-[11px] text-muted-foreground shrink-0">
            {start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-1.5">
          <Badge variant="outline" className="text-[10px] py-0 px-1.5">
            {start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
          </Badge>
          {m.meetingUrl && (
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Video className="size-3" /> Online
            </span>
          )}
          {m.location && (
            <span className="text-[11px] text-muted-foreground flex items-center gap-1 truncate">
              <MapPin className="size-3" /> {m.location}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col p-6 rounded-2xl border bg-card text-card-foreground shadow-sm h-full">
      <div className="flex items-center justify-between mb-5">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Meetings
          </h3>
          <span className="text-xs text-muted-foreground">Today & this week</span>
        </div>
        <div className="p-1.5 rounded-xl bg-indigo-500/10 text-indigo-500">
          <CalendarClock className="size-4.5" />
        </div>
      </div>

      <div className="flex-1 overflow-auto max-h-[380px] pr-1">
        {meetings === null ? (
          <p className="text-sm italic text-muted-foreground/60 py-6 text-center">Loading…</p>
        ) : active.length === 0 ? (
          <p className="text-sm italic text-muted-foreground/60 py-6 text-center">
            No meetings scheduled this week
          </p>
        ) : (
          <div className="space-y-4">
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Today
              </span>
              {todays.length === 0 ? (
                <p className="text-sm italic text-muted-foreground/60 py-2">No meetings today</p>
              ) : (
                <div className="divide-y divide-border mt-1">{todays.map(renderMeeting)}</div>
              )}
            </div>

            {rest.length > 0 && (
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Rest of the week
                </span>
                <div className="divide-y divide-border mt-1">{rest.map(renderMeeting)}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
