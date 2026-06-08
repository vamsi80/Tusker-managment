"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
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
      const isBoard = action.includes("BOARD");

      // 3. 🚀 SURGICAL DISPATCH
      const syncDetail = {
        action,
        category: isTask ? "TASK" : isProject ? "PROJECT" : isMember ? "MEMBER" : isAttendance ? "ATTENDANCE" : isBoard ? "BOARD" : "OTHER",
        record: { ...payload, id: entityId },
        oldRecord: data.oldData,
        raw: data,
        isActor
      };

      if (isTask || isProject || isMember || isAttendance || isBoard) {
        console.log(`[REALTIME_SYNC] 🚀 Dispatching ${syncDetail.category} event: ${action}`);

        // Global event (for backward compatibility)
        window.dispatchEvent(new CustomEvent("realtime-sync-refresh", { detail: syncDetail }));

        // Category-specific events (for cleaner individual listeners)
        if (isTask) window.dispatchEvent(new CustomEvent("realtime-task-sync", { detail: syncDetail }));
        if (isProject) window.dispatchEvent(new CustomEvent("realtime-project-sync", { detail: syncDetail }));
        if (isMember) window.dispatchEvent(new CustomEvent("realtime-member-sync", { detail: syncDetail }));
        if (isAttendance) window.dispatchEvent(new CustomEvent("realtime-attendance-sync", { detail: syncDetail }));
        if (isBoard) window.dispatchEvent(new CustomEvent("realtime-board-sync", { detail: syncDetail }));

        // 4. 🔄 SELECTIVE BACKGROUND REVALIDATION
        // Structural project changes (create/delete/archive) and all member role/access changes
        // require a full RSC re-render. Routine field edits (PROJECT_UPDATED) are handled
        // surgically by CustomEvent listeners and do not need a full reload.
        const STRUCTURAL_PROJECT_ACTIONS = new Set([
          "PROJECT_CREATED", "PROJECT_DELETED", "PROJECT_ARCHIVED", "PROJECT_RESTORED",
        ]);
        const requiresBackgroundRefresh = isMember || STRUCTURAL_PROJECT_ACTIONS.has(action);

        if (requiresBackgroundRefresh) {
          if (refreshTimeout) clearTimeout(refreshTimeout);
          refreshTimeout = setTimeout(() => {
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
              {data.newData?.text || data.action?.replace(/_/g, " ").toLowerCase()}
            </span>
          ),
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
      if (refreshTimeout) clearTimeout(refreshTimeout);
    };
  }, [
    workspaceId,
    projectId,
    session?.user?.id,
    router,
  ]);

  return null;
}
