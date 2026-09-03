"use client";

import { useMeetingStore } from "@/lib/store/meeting-store";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarIcon, Clock, Plus, Video } from "lucide-react";

export function TodayAgendaWidget() {
  const { meetings, openScheduleModal, openDetailsModal } = useMeetingStore();

  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];

  // Filter meetings occurring today
  const todayMeetings = meetings.filter((m) => {
    if (m.status === "CANCELLED") return false;
    const startStr = new Date(m.startTime).toISOString().split("T")[0];
    return startStr === todayStr;
  });

  // Sort chronologically
  todayMeetings.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  return (
    <div className="flex flex-col p-6 rounded-2xl border bg-card text-card-foreground shadow-xs">
      <div className="flex items-center justify-between mb-4">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Today's Agenda
            </h3>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {todayMeetings.length}
            </Badge>
          </div>
          <span className="text-xs text-muted-foreground">
            {now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
          </span>
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={() => openScheduleModal({ date: now })}
          className="size-8 p-0 rounded-xl"
          title="Schedule meeting for today"
        >
          <Plus className="size-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto max-h-[340px] pr-1 space-y-3">
        {todayMeetings.length === 0 ? (
          <div className="py-8 text-center space-y-2">
            <div className="size-10 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto text-muted-foreground">
              <CalendarIcon className="size-5" />
            </div>
            <p className="text-xs text-muted-foreground">No meetings scheduled for today</p>
            <Button
              variant="link"
              size="sm"
              onClick={() => openScheduleModal({ date: now })}
              className="text-xs h-auto p-0 font-medium"
            >
              + Schedule one now
            </Button>
          </div>
        ) : (
          todayMeetings.map((meeting) => {
            const start = new Date(meeting.startTime);
            const end = new Date(meeting.endTime);
            const isOngoing = now >= start && now <= end;
            const isPast = now > end;
            const diffMinutes = Math.round((start.getTime() - now.getTime()) / (1000 * 60));

            return (
              <div
                key={meeting.id}
                onClick={() => openDetailsModal(meeting)}
                className={`p-3 rounded-xl border transition-all cursor-pointer group hover:shadow-xs ${
                  isOngoing
                    ? "bg-primary/5 border-primary/30 ring-1 ring-primary/20"
                    : isPast
                    ? "opacity-60 bg-muted/20 border-border/50"
                    : "bg-card hover:bg-muted/30"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                        <Clock className="size-3" />
                        {start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      {meeting.meetingUrl && (
                        <span className="text-primary" title="Has video link">
                          <Video className="size-3" />
                        </span>
                      )}
                    </div>

                    <h4 className="text-xs font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                      {meeting.title}
                    </h4>
                  </div>

                  <Badge
                    variant={
                      isOngoing ? "default" : isPast ? "secondary" : diffMinutes <= 60 ? "outline" : "outline"
                    }
                    className={`text-[9px] px-1.5 py-0 shrink-0 font-medium ${
                      isOngoing ? "animate-pulse bg-emerald-500 text-white" : ""
                    }`}
                  >
                    {isOngoing
                      ? "Live"
                      : isPast
                      ? "Ended"
                      : diffMinutes <= 60
                      ? `In ${diffMinutes}m`
                      : "Scheduled"}
                  </Badge>
                </div>

                {/* Attendees Mini-stack */}
                {meeting.attendees?.length > 0 && (
                  <div className="flex items-center gap-1.5 pt-2 mt-1 border-t border-border/40">
                    <div className="flex -space-x-1 overflow-hidden">
                      {meeting.attendees.slice(0, 3).map((a) => (
                        <Avatar key={a.id} className="size-4.5 border border-background">
                          <AvatarImage src={a.user?.image || ""} />
                          <AvatarFallback className="text-[7px]">
                            {(a.user?.surname || a.user?.name || "M")[0]?.toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                      ))}
                    </div>
                    <span className="text-[10px] text-muted-foreground truncate">
                      {meeting.attendees.length === 1
                        ? meeting.attendees[0].user?.surname || "1 attendee"
                        : `${meeting.attendees.length} participants`}
                    </span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
