"use client";

import { useEffect, useRef } from "react";
import { toast } from "@/lib/toast";
import { useParams, useRouter } from "next/navigation";
import { pubsub, EVENTS } from "@/lib/pubsub";
import { authClient } from "@/lib/auth-client";
import { usePresenceHeartbeat } from "@/hooks/use-presence-heartbeat";

export function RealtimeNotificationListener() {
  const router = useRouter();
  const params = useParams();
  const { data: session } = authClient.useSession();
  const workspaceId = params?.workspaceId as string;
  const projectId = params?.projectId as string;

  // ✅ Global Presence Heartbeat — fires on ALL workspace pages
  usePresenceHeartbeat(workspaceId);

  const processedEventsRef = useRef(new Set<string>());

  useEffect(() => {
    if (!workspaceId) return;

    let refreshTimeout: any = null;

    // 1. Initialize the central Real-Time Service
    pubsub.init(workspaceId, session?.user?.id);

    /**
     * CENTRAL HANDLER: Handles both Activity Log and Team Updates
     */
    const handleSurgicalSync = (data: any) => {
      const isActor = data.userId === session?.user?.id;

      // 🚀 DEDUPLICATION: Prevent double-processing of the same event (activity_log + team_update)
      const eventId =
        data.pusherEventId ||
        `${data.entityId}-${data.action || data.type}-${data.createdAt || Date.now()}`;
      if (processedEventsRef.current.has(eventId)) return;
      processedEventsRef.current.add(eventId);
      setTimeout(() => processedEventsRef.current.delete(eventId), 10000); // Clear after 10s

      // 1. Standardize action/type
      const action =
        data.action ||
        (data.type === "CREATE"
          ? "TASK_CREATED"
          : data.type === "UPDATE"
            ? "TASK_UPDATED"
            : data.type === "DELETE"
              ? "TASK_DELETED"
              : data.type === "CHECK_IN"
                ? "CHECKED_IN"
                : data.type === "CHECK_OUT"
                  ? "CHECKED_OUT"
                  : data.type === "LEAVE_REQUESTED"
                    ? "LEAVE_REQUESTED"
                    : "");

      // 🚀 SURGICAL PAYLOAD: Prioritize newData for updates
      const payload =
        data.newData ||
        data.payload ||
        data.metadata?.payload ||
        data.metadata ||
        data;
      const entityId = data.entityId || payload?.id;

      // 2. Identify Category
      const isMeeting = action.includes("MEETING") || !!data.meetingId;
      const isTask = action.includes("TASK");
      const isProject = action.includes("PROJECT");
      const isMember = action.includes("MEMBER");
      const isAttendance =
        action.includes("LEAVE") ||
        action.includes("CHECKED") ||
        action.includes("ATTENDANCE");

      // 3. 🚀 SURGICAL DISPATCH
      const syncDetail = {
        action,
        category: isMeeting
          ? "MEETING"
          : isTask
            ? "TASK"
            : isProject
              ? "PROJECT"
              : isMember
                ? "MEMBER"
                : isAttendance
                  ? "ATTENDANCE"
                  : "OTHER",
        record: { ...payload, id: entityId || data.meetingId },
        oldRecord: data.oldData,
        raw: data,
        isActor,
      };

      if (isMeeting || isTask || isProject || isMember || isAttendance) {
        console.log(
          `[REALTIME_SYNC] 🚀 Dispatching ${syncDetail.category} event: ${action}`,
        );

        // Global event (for backward compatibility)
        window.dispatchEvent(
          new CustomEvent("realtime-sync-refresh", { detail: syncDetail }),
        );

        // Category-specific events (for cleaner individual listeners)
        if (isMeeting)
          window.dispatchEvent(
            new CustomEvent("realtime-meeting-sync", { detail: syncDetail }),
          );
        if (isTask)
          window.dispatchEvent(
            new CustomEvent("realtime-task-sync", { detail: syncDetail }),
          );
        if (isProject)
          window.dispatchEvent(
            new CustomEvent("realtime-project-sync", { detail: syncDetail }),
          );
        if (isMember)
          window.dispatchEvent(
            new CustomEvent("realtime-member-sync", { detail: syncDetail }),
          );
        if (isAttendance)
          window.dispatchEvent(
            new CustomEvent("realtime-attendance-sync", { detail: syncDetail }),
          );

        // 4. 🔄 SELECTIVE BACKGROUND REVALIDATION
        const requiresBackgroundRefresh = isProject || isMember || isAttendance;

        if (requiresBackgroundRefresh) {
          if (refreshTimeout) clearTimeout(refreshTimeout);
          refreshTimeout = setTimeout(() => {
            console.log(
              `[REALTIME_SYNC] 🔄 Background revalidation triggered for: ${action}`,
            );
            router.refresh();
          }, 2000); // 2s debounce for background revalidation
        }
      }
    };

    const showWhatsAppStyleNotification = (
      conversationId: string,
      senderName: string,
      content: string,
    ) => {
      const currentPath =
        typeof window !== "undefined" ? window.location.pathname : "";
      const isInThisChat = currentPath.includes(
        `/myspace/conversations/${conversationId}`,
      );
      if (isInThisChat) return;

      const dedupeKey = `dm-toast-${conversationId}-${content.slice(0, 30)}`;
      if (processedEventsRef.current.has(dedupeKey)) return;
      processedEventsRef.current.add(dedupeKey);
      setTimeout(() => processedEventsRef.current.delete(dedupeKey), 8000);

      // WhatsApp style: Title is sender's name, description is the message text
      toast(
        <div
          className="flex flex-col gap-0.5 cursor-pointer w-full"
          onClick={() =>
            router.push(
              `/w/${workspaceId}/myspace/conversations/${conversationId}`,
            )
          }
        >
          <span className="font-semibold text-sm text-foreground">{senderName}</span>
          <span className="text-xs text-muted-foreground line-clamp-2">
            {content.length > 80 ? `${content.substring(0, 77)}...` : content}
          </span>
        </div>,
        {
          duration: 7000,
          action: {
            label: "Reply",
            onClick: () =>
              router.push(
                `/w/${workspaceId}/myspace/conversations/${conversationId}`,
              ),
          },
        }
      );

      // Browser native desktop notification when window/tab is in background
      if (
        typeof window !== "undefined" &&
        "Notification" in window &&
        Notification.permission === "granted" &&
        document.visibilityState !== "visible"
      ) {
        try {
          const nativeNotif = new Notification(senderName, {
            body: content,
          });
          nativeNotif.onclick = () => {
            window.focus();
            router.push(
              `/w/${workspaceId}/myspace/conversations/${conversationId}`,
            );
          };
        } catch (_) {}
      }
    };

    // 2. Subscribe to events
    const unsubscribeActivity = pubsub.subscribe(
      EVENTS.APP_ACTIVITY_LOG,
      (data: any) => {
        const isActor = data.userId === session?.user?.id;

        // Handle DM notifications in WhatsApp style
        if (data.action === "DM_MESSAGE") {
          if (!isActor) {
            const conversationId =
              data.entityId ||
              data.conversationId ||
              data.newData?.conversationId;
            const senderName =
              data.userName || data.senderName || "Direct Message";
            const content =
              data.newData?.content ||
              data.metadata?.content ||
              data.message ||
              "";
            if (conversationId) {
              showWhatsAppStyleNotification(
                conversationId,
                senderName,
                content,
              );
            }
          }
          return;
        }

        // 1. Show Toast (Only for other users to avoid duplicates for the actor)
        if (data.message && !isActor) {
          toast.info(data.message, {
            description: (
              <span
                style={{
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                className="text-muted-foreground block text-xs mt-1"
              >
                {data.newData?.text ||
                  data.action?.replace(/_/g, " ").toLowerCase()}
              </span>
            ),
            duration: 5000,
          });
        }

        // 2. Sync if it's NOT a team_update event (which is handled separately to avoid duplicates)
        if (!data.broadcastEvent || data.broadcastEvent !== "team_update") {
          handleSurgicalSync(data);
        }
      },
    );

    const unsubscribeTeam = pubsub.subscribe(
      EVENTS.TEAM_UPDATE,
      (data: any) => {
        // Team update carries the main surgical payload
        handleSurgicalSync(data);
      },
    );

    const unsubscribeConversation = pubsub.subscribe(
      EVENTS.CONVERSATION_UPDATE,
      (data: any) => {
        if (data?.action === "new_message" && data?.message) {
          const isFromOther = data.message.senderId !== session?.user?.id;
          if (isFromOther) {
            const senderName =
              data.message.user?.surname ||
              data.message.user?.name ||
              "Direct Message";
            showWhatsAppStyleNotification(
              data.conversationId,
              senderName,
              data.message.content || "",
            );
          }
        }
      },
    );

    return () => {
      unsubscribeActivity();
      unsubscribeTeam();
      unsubscribeConversation();
      if (refreshTimeout) clearTimeout(refreshTimeout);
    };
  }, [workspaceId, projectId, session?.user?.id, router]);

  return null;
}
