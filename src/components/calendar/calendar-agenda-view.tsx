"use client";

import { useMemo } from "react";
import { useMeetingStore } from "@/lib/store/meeting-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Video, MapPin, Clock, Calendar as CalendarIcon, ExternalLink, Briefcase, Plus } from "lucide-react";
import type { MeetingUI } from "@/lib/api-client/meetings";
import { calendarDayKey } from "@/lib/date-utils";

export function CalendarAgendaView() {
  const { meetings, filterType, searchQuery, openScheduleModal, openDetailsModal } = useMeetingStore();

  const groupedMeetings = useMemo(() => {
    const now = new Date();
    const todayStr = calendarDayKey(now);

    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    const tomorrowStr = calendarDayKey(tomorrow);

    const filtered = meetings.filter((m) => {
      if (m.status === "CANCELLED") return false;
      if (filterType !== "ALL" && m.type !== filterType) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          m.title.toLowerCase().includes(q) ||
          m.description?.toLowerCase().includes(q) ||
          m.location?.toLowerCase().includes(q)
        );
      }
      return true;
    });

    // Sort chronologically
    filtered.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

    const groups: Array<{ label: string; dateStr: string; items: MeetingUI[] }> = [];
    const groupMap = new Map<string, MeetingUI[]>();

    filtered.forEach((m) => {
      const dateKey = calendarDayKey(m.startTime);
      if (!groupMap.has(dateKey)) {
        groupMap.set(dateKey, []);
      }
      groupMap.get(dateKey)!.push(m);
    });

    groupMap.forEach((items, dateKey) => {
      let label = "";
      const d = new Date(`${dateKey}T00:00:00`);

      if (dateKey === todayStr) {
        label = "Today";
      } else if (dateKey === tomorrowStr) {
        label = "Tomorrow";
      } else {
        label = d.toLocaleDateString("en-US", {
          weekday: "long",
          month: "short",
          day: "numeric",
          year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
        });
      }

      groups.push({ label, dateStr: dateKey, items });
    });

    return groups;
  }, [meetings, filterType, searchQuery]);

  if (groupedMeetings.length === 0) {
    return (
      <div className="p-12 text-center rounded-2xl border bg-card text-card-foreground shadow-xs space-y-3">
        <div className="size-12 rounded-2xl bg-muted/60 flex items-center justify-center mx-auto text-muted-foreground">
          <CalendarIcon className="size-6" />
        </div>
        <h3 className="text-base font-semibold text-foreground">No upcoming meetings scheduled</h3>
        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
          Keep your team aligned by scheduling sprint syncs, project reviews, or client calls.
        </p>
        <Button
          onClick={() => openScheduleModal()}
          className="rounded-xl font-semibold gap-1.5 shadow-xs"
        >
          <Plus className="size-4" /> Schedule First Meeting
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {groupedMeetings.map((group) => (
        <div key={group.dateStr} className="space-y-3">
          {/* Day Group Header */}
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-foreground">{group.label}</h3>
            <span className="text-xs text-muted-foreground">
              {new Date(`${group.dateStr}T00:00:00`).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
            </span>
            <div className="h-[1px] flex-1 bg-border/60 ml-2" />
          </div>

          {/* Day Meetings Cards */}
          <div className="space-y-2.5">
            {group.items.map((m) => {
              const start = new Date(m.startTime);
              const end = new Date(m.endTime);
              const durationMinutes = Math.round((end.getTime() - start.getTime()) / (1000 * 60));

              return (
                <div
                  key={m.id}
                  onClick={() => openDetailsModal(m)}
                  className="p-4 rounded-2xl border bg-card hover:bg-muted/30 transition-all shadow-xs cursor-pointer group flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-4 min-w-0">
                    {/* Time Column */}
                    <div className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-muted/60 border text-center shrink-0 min-w-[76px]">
                      <span className="text-xs font-bold text-foreground">
                        {start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-medium">
                        {durationMinutes >= 60 ? `${durationMinutes / 60}h` : `${durationMinutes}m`}
                      </span>
                    </div>

                    {/* Info */}
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-[10px] font-semibold capitalize">
                          {m.type.replace(/_/g, " ").toLowerCase()}
                        </Badge>
                        {m.project && (
                          <Badge variant="outline" className="text-[10px] flex items-center gap-1 border-primary/20">
                            <Briefcase className="size-2.5 text-primary" />
                            {m.project.name}
                          </Badge>
                        )}
                        <Badge
                          variant={m.status === "COMPLETED" ? "secondary" : "outline"}
                          className="text-[10px] capitalize"
                        >
                          {m.status.toLowerCase()}
                        </Badge>
                      </div>

                      <h4 className="text-sm sm:text-base font-bold text-foreground truncate group-hover:text-primary transition-colors">
                        {m.title}
                      </h4>

                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                        {m.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="size-3" /> {m.location}
                          </span>
                        )}
                        {m.description && (
                          <span className="truncate max-w-xs">{m.description}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Attendees and Join Actions */}
                  <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/40">
                    {/* Attendees Avatar Stack */}
                    {m.attendees?.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        <div className="flex -space-x-1.5 overflow-hidden">
                          {m.attendees.slice(0, 4).map((a) => (
                            <Avatar key={a.id} className="size-6 border border-background">
                              <AvatarImage src={a.user?.image || ""} />
                              <AvatarFallback className="text-[8px]">
                                {(a.user?.surname || a.user?.name || "M")[0]?.toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                          ))}
                        </div>
                        {m.attendees.length > 4 && (
                          <span className="text-[10px] text-muted-foreground font-medium">
                            +{m.attendees.length - 4}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Join button if call link */}
                    {m.meetingUrl && (
                      <Button
                        asChild
                        size="sm"
                        onClick={(e) => e.stopPropagation()}
                        className="rounded-xl h-8 text-xs font-semibold gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
                      >
                        <a href={m.meetingUrl} target="_blank" rel="noopener noreferrer">
                          <Video className="size-3.5" /> Join <ExternalLink className="size-3 opacity-70" />
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
