"use client";

import { useMeetingIntimations } from "@/hooks/use-meeting-intimations";
import { useMeetingStore } from "@/lib/store/meeting-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Video, Bell, Clock, ArrowRight, Radio } from "lucide-react";

export function UpcomingMeetingAlert() {
  const {
    upcomingMeeting,
    minutesUntil,
    isNow,
    hasNotificationPermission,
    requestNotificationPermission,
  } = useMeetingIntimations();

  const { openDetailsModal } = useMeetingStore();

  if (!upcomingMeeting) {
    return null;
  }

  const start = new Date(upcomingMeeting.startTime);
  const end = new Date(upcomingMeeting.endTime);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/10 via-primary/5 to-background p-4 sm:p-5 shadow-sm transition-all animate-in fade-in slide-in-from-top-2 duration-300">
      {/* Background glow element */}
      <div className="absolute -right-10 -bottom-10 size-40 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative z-10">
        <div className="space-y-1.5 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {isNow ? (
              <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white gap-1.5 text-xs font-semibold px-2.5 py-0.5 animate-pulse">
                <Radio className="size-3" /> Happening Now
              </Badge>
            ) : (
              <Badge variant="default" className="gap-1.5 text-xs font-semibold px-2.5 py-0.5">
                <Clock className="size-3" />
                {minutesUntil !== null ? `Starting in ${minutesUntil}m` : "Upcoming Meeting"}
              </Badge>
            )}

            <Badge variant="outline" className="text-xs capitalize border-primary/20">
              {upcomingMeeting.type.replace(/_/g, " ").toLowerCase()}
            </Badge>

            {!hasNotificationPermission && (
              <button
                type="button"
                onClick={requestNotificationPermission}
                className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors underline underline-offset-2 ml-1"
              >
                <Bell className="size-3 text-amber-500" /> Enable desktop alerts
              </button>
            )}
          </div>

          <h3 className="text-base sm:text-lg font-bold text-foreground truncate pt-0.5">
            {upcomingMeeting.title}
          </h3>

          <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
            <span className="font-medium text-foreground/80">
              {start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} –{" "}
              {end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
            {upcomingMeeting.location && <span>📍 {upcomingMeeting.location}</span>}

            {/* Attendees Stack */}
            {upcomingMeeting.attendees?.length > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="flex -space-x-1.5 overflow-hidden">
                  {upcomingMeeting.attendees.slice(0, 4).map((a) => (
                    <Avatar key={a.id} className="size-5 border border-background">
                      <AvatarImage src={a.user?.image || ""} />
                      <AvatarFallback className="text-[8px]">
                        {(a.user?.surname || a.user?.name || "M")[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                </div>
                {upcomingMeeting.attendees.length > 4 && (
                  <span className="text-[10px] text-muted-foreground">
                    +{upcomingMeeting.attendees.length - 4} more
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 pt-1 sm:pt-0">
          {upcomingMeeting.meetingUrl && (
            <Button
              asChild
              size="sm"
              className="rounded-xl font-semibold gap-1.5 shadow-sm bg-primary text-primary-foreground hover:bg-primary/90 h-9"
            >
              <a href={upcomingMeeting.meetingUrl} target="_blank" rel="noopener noreferrer">
                <Video className="size-4" /> Join Call
              </a>
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => openDetailsModal(upcomingMeeting)}
            className="rounded-xl text-xs gap-1.5 h-9 bg-background/80 hover:bg-background"
          >
            Details <ArrowRight className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
