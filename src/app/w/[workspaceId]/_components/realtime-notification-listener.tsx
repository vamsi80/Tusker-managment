"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useParams, useRouter } from "next/navigation";
import { pubsub, EVENTS } from "@/lib/pubsub";
import { authClient } from "@/lib/auth-client";

export function RealtimeNotificationListener() {
  const router = useRouter();
  const params = useParams();
  const { data: session } = authClient.useSession();
  const workspaceId = params?.workspaceId as string;
  const projectId = params?.projectId as string;

  const refreshTimeoutRef = useRef<any>(null);
  const processedEventsRef = useRef(new Set<string>());

  useEffect(() => {
    if (!workspaceId) return;

    // 1. Initialize the central Real-Time Service
    pubsub.init(workspaceId, session?.user?.id);

    /**
     * CENTRAL HANDLER: Handles both Activity Log and Team Updates
     */
    const handleSurgicalSync = (data: any) => {
      const isActor = data.userId === session?.user?.id;

      // 🚀 DEDUPLICATION: Prevent double-processing of the same event (activity_log + team_update)
      const eventId = data.pusherEventId || `${data.entityId}-${data.action || data.type}-${data.createdAt || Date.now()}`;
      if (processedEventsRef.current.has(eventId)) return;
      processedEventsRef.current.add(eventId);
      setTimeout(() => processedEventsRef.current.delete(eventId), 10000); // Clear after 10s

      // 1. Standardize action/type
      const action = data.action ||
        (data.type === "CREATE" ? "TASK_CREATED" :
          data.type === "UPDATE" ? "TASK_UPDATED" :
            data.type === "DELETE" ? "TASK_DELETED" :
              data.type === "CHECK_IN" ? "CHECKED_IN" :
                data.type === "CHECK_OUT" ? "CHECKED_OUT" :
                  data.type === "LEAVE_REQUESTED" ? "LEAVE_REQUESTED" :
                    "");

      // 🚀 SURGICAL PAYLOAD: Prioritize newData for updates
      const payload = data.newData || data.payload || data.metadata?.payload || data.metadata || data;
      const entityId = data.entityId || payload?.id;

      // 2. Identify Category
      const isTask = action.includes("TASK");
      const isProject = action.includes("PROJECT");
      const isMember = action.includes("MEMBER");
      const isAttendance = action.includes("LEAVE") || action.includes("CHECKED") || action.includes("ATTENDANCE");

      // 3. 🚀 SURGICAL DISPATCH
      const syncDetail = {
        action,
        category: isTask ? "TASK" : isProject ? "PROJECT" : isMember ? "MEMBER" : isAttendance ? "ATTENDANCE" : "OTHER",
        record: { ...payload, id: entityId },
        oldRecord: data.oldData,
        raw: data,
        isActor
      };

      if (isTask || isProject || isMember || isAttendance) {
        console.log(`[REALTIME_SYNC] 🚀 Dispatching ${syncDetail.category} event: ${action}`);

        // Global event (for backward compatibility)
        window.dispatchEvent(new CustomEvent("realtime-sync-refresh", { detail: syncDetail }));

        // Category-specific events (for cleaner individual listeners)
        if (isTask) window.dispatchEvent(new CustomEvent("realtime-task-sync", { detail: syncDetail }));
        if (isProject) window.dispatchEvent(new CustomEvent("realtime-project-sync", { detail: syncDetail }));
        if (isMember) window.dispatchEvent(new CustomEvent("realtime-member-sync", { detail: syncDetail }));
        if (isAttendance) window.dispatchEvent(new CustomEvent("realtime-attendance-sync", { detail: syncDetail }));

        // 4. 🔄 SELECTIVE BACKGROUND REVALIDATION
        const requiresBackgroundRefresh = isProject || isMember || isAttendance;

        if (requiresBackgroundRefresh) {
          if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
          refreshTimeoutRef.current = setTimeout(() => {
            console.log(`[REALTIME_SYNC] 🔄 Background revalidation triggered for: ${action}`);
            router.refresh();
          }, 2000); // 2s debounce for background revalidation
        }
      }
    };

    // 2. Subscribe to events
    const unsubscribeActivity = pubsub.subscribe(EVENTS.APP_ACTIVITY_LOG, (data: any) => {
      const isActor = data.userId === session?.user?.id;

      // 1. Show Toast (Only for other users to avoid duplicates for the actor)
      if (data.message && !isActor) {
        toast.info(data.message, {
          description: data.newData?.text || data.action?.replace(/_/g, " ").toLowerCase(),
          duration: 5000,
        });
      }

      // 2. Sync if it's NOT a team_update event (which is handled separately to avoid duplicates)
      if (!data.broadcastEvent || data.broadcastEvent !== "team_update") {
        handleSurgicalSync(data);
      }
    });

    const unsubscribeTeam = pubsub.subscribe(EVENTS.TEAM_UPDATE, (data: any) => {
      // Team update carries the main surgical payload
      handleSurgicalSync(data);
    });

    return () => {
      unsubscribeActivity();
      unsubscribeTeam();
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    };
  }, [
    workspaceId,
    projectId,
    session?.user?.id,
    router,
  ]);

  return null;
}
