"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { toast } from "sonner";
import { useMeetingStore } from "@/lib/store/meeting-store";
import type { MeetingUI } from "@/lib/api-client/meetings";
import { authClient } from "@/lib/auth-client";

export function useMeetingIntimations() {
  const { meetings } = useMeetingStore();
  const { data: session } = authClient.useSession();
  const currentUserId = session?.user?.id;

  const [upcomingMeeting, setUpcomingMeeting] = useState<MeetingUI | null>(null);
  const [minutesUntil, setMinutesUntil] = useState<number | null>(null);
  const [isNow, setIsNow] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);

  const alertedMeetingsRef = useRef<Set<string>>(new Set());

  // Check notification permission
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setHasPermission(Notification.permission === "granted");
    }
  }, []);

  const requestNotificationPermission = useCallback(async () => {
    if (typeof window !== "undefined" && "Notification" in window) {
      const perm = await Notification.requestPermission();
      setHasPermission(perm === "granted");
      if (perm === "granted") {
        toast.success("Meeting desktop intimations enabled!");
      }
    }
  }, []);

  // Proactive meeting scanner
  useEffect(() => {
    const checkUpcomingMeetings = () => {
      const now = new Date();
      const userMeetings = meetings.filter((m) => {
        if (m.status === "CANCELLED" || m.status === "COMPLETED") return false;
        // Check if user is organizer or attendee
        if (m.organizerId === currentUserId) return true;
        return m.attendees.some((a) => a.userId === currentUserId && a.status !== "DECLINED");
      });

      let nextMeeting: MeetingUI | null = null;
      let minDiff = Infinity;
      let currentlyOngoing = false;

      for (const m of userMeetings) {
        const start = new Date(m.startTime).getTime();
        const end = new Date(m.endTime).getTime();
        const diffMinutes = Math.round((start - now.getTime()) / (1000 * 60));

        // Ongoing meeting
        if (now.getTime() >= start && now.getTime() <= end) {
          nextMeeting = m;
          currentlyOngoing = true;
          minDiff = 0;
          break;
        }

        // Upcoming in the next 60 minutes
        if (diffMinutes > 0 && diffMinutes <= 60 && diffMinutes < minDiff) {
          minDiff = diffMinutes;
          nextMeeting = m;
        }

        // Intimation trigger: starting in <= reminderMinutes (default 15)
        const reminderThreshold = m.reminderMinutes || 15;
        if (diffMinutes > 0 && diffMinutes <= reminderThreshold && !alertedMeetingsRef.current.has(m.id)) {
          alertedMeetingsRef.current.add(m.id);

          // 1. In-app toast alert
          toast.info(`Upcoming Meeting in ${diffMinutes}m`, {
            description: `${m.title}${m.location ? ` • ${m.location}` : ""}`,
            action: m.meetingUrl
              ? {
                  label: "Join Call",
                  onClick: () => window.open(m.meetingUrl!, "_blank"),
                }
              : undefined,
            duration: 9000,
          });

          // 2. Desktop notification
          if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
            try {
              new Notification(`Meeting in ${diffMinutes} mins: ${m.title}`, {
                body: `${m.title} is starting at ${new Date(m.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`,
                icon: "/favicon.ico",
              });
            } catch (e) {
              console.warn("[INTIMATION] Desktop notification failed:", e);
            }
          }
        }
      }

      setUpcomingMeeting(nextMeeting);
      setMinutesUntil(currentlyOngoing ? 0 : minDiff === Infinity ? null : minDiff);
      setIsNow(currentlyOngoing);
    };

    checkUpcomingMeetings();
    const interval = setInterval(checkUpcomingMeetings, 30_000); // scan every 30 seconds
    return () => clearInterval(interval);
  }, [meetings, currentUserId]);

  return {
    upcomingMeeting,
    minutesUntil,
    isNow,
    hasNotificationPermission: hasPermission,
    requestNotificationPermission,
  };
}
