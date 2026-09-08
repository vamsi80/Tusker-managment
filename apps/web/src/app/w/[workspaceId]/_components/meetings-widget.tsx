"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarClock, MapPin, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { apiClient } from "@tusker/api-client";
import type { MeetingUI } from "@tusker/api-client/meetings";
import { useMeetingStore } from "@/lib/store/meeting-store";
import { cn } from "@/lib/utils";
import { useSafeNavigation } from "@/hooks/use-safe-navigation";

/**
 * A month either side of today. Wide enough that "Previous" has something in it
 * without pulling the whole meeting history into the dashboard.
 */
function window30() {
  const start = new Date();
  start.setDate(start.getDate() - 30);
  start.setHours(0, 0, 0, 0);

  const end = new Date();
  end.setDate(end.getDate() + 30);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

/**
 * Read-only view of the week's meetings, today's first. Scheduling lives on the
 * calendar page.
 */
export function MeetingsWidget({ workspaceId }: { workspaceId: string }) {
  const [meetings, setMeetings] = useState<MeetingUI[] | null>(null);
  const [tab, setTab] = useState<"upcoming" | "previous">("upcoming");
  const router = useSafeNavigation();
  const { setSelectedDate } = useMeetingStore();

  /**
   * Open the calendar on the meeting's own day. The store is global, so setting
   * the date before navigating means the page lands on that week/month rather
   * than on today - clicking a meeting three days out should not show today.
   */
  const openInCalendar = (m: MeetingUI) => {
    setSelectedDate(new Date(m.startTime));
    router.push(`/w/${workspaceId}/calendar`);
  };

  const load = useCallback(() => {
    const { start, end } = window30();
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

  const now = Date.now();
  const active = (meetings ?? []).filter((m) => m.status !== "CANCELLED");
  // Upcoming reads forwards from the next one; previous reads backwards from the
  // most recent, which is the order you actually want in each case.
  const shown = active
    .filter((m) =>
      tab === "upcoming"
        ? new Date(m.startTime).getTime() >= now
        : new Date(m.startTime).getTime() < now
    )
    .sort((a, b) => {
      const diff = new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
      return tab === "upcoming" ? diff : -diff;
    });

  const renderMeeting = (m: MeetingUI) => {
    const start = new Date(m.startTime);
    return (
      <button
        key={m.id}
        type="button"
        onClick={() => openInCalendar(m)}
        className="w-full text-left py-3 first:pt-0 last:pb-0 cursor-pointer rounded-lg transition-colors hover:bg-muted/50"
      >
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
      </button>
    );
  };

  return (
    <div className="flex flex-col p-6 rounded-2xl border bg-card text-card-foreground shadow-sm h-full">
      <div className="flex items-center justify-between mb-5">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Meetings
          </h3>
          <span className="text-xs text-muted-foreground">
            {tab === "upcoming" ? "Next 30 days" : "Past 30 days"}
          </span>
        </div>
        <div className="p-1.5 rounded-xl bg-indigo-500/10 text-indigo-500">
          <CalendarClock className="size-4.5" />
        </div>
      </div>

      <div className="flex items-center p-1 rounded-xl bg-muted border text-xs mb-4 w-fit">
        {(["previous", "upcoming"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "px-3 py-1 rounded-lg font-semibold capitalize transition-all",
              tab === t
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto max-h-[380px] pr-1">
        {meetings === null ? (
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <div key={i} className="h-12 rounded-xl bg-muted/40 animate-pulse" />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <p className="text-sm italic text-muted-foreground/60 py-6 text-center">
            {tab === "upcoming" ? "No upcoming meetings" : "No previous meetings"}
          </p>
        ) : (
          <div className="divide-y divide-border">{shown.map(renderMeeting)}</div>
        )}
      </div>
    </div>
  );
}
