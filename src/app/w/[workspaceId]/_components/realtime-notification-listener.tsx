"use client";

import { useEffect } from "react";
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

  useEffect(() => {
    if (!workspaceId) return;

    // 1. Initialize the central Real-Time Service
    pubsub.init(workspaceId, session?.user?.id);

    /**
     * CENTRAL HANDLER: Handles both Activity Log and Team Updates
     */
    const handleSurgicalSync = (data: any) => {
      const isActor = data.userId === session?.user?.id;

      // Standardize action/type
      const action = data.action ||
        (data.type === "CREATE" ? "TASK_CREATED" :
          data.type === "UPDATE" ? "TASK_UPDATED" :
            data.type === "DELETE" ? "TASK_DELETED" :
              data.type === "CHECK_IN" ? "CHECKED_IN" :
                data.type === "CHECK_OUT" ? "CHECKED_OUT" :
                  data.type === "LEAVE_REQUESTED" ? "LEAVE_REQUESTED" :
                    "");
      const payload = data.newData || data.payload || data.metadata?.payload || data.metadata || data;
      const entityId = data.entityId || payload?.id;

      // 🚀 SURGICAL SYNC LOGIC
      // Structural changes (create/delete/update) require board-level state updates or re-fetches
      // We explicitly exclude COMMENT_CREATED as it is not a structural change to the task list
      const isStructural =
        (action.includes("CREATED") && action !== "COMMENT_CREATED") ||
        action.includes("UPDATED") ||
        action.includes("DELETED") ||
        action.includes("LEAVE") ||
        action.includes("CHECKED") ||
        action.includes("ATTENDANCE") ||
        action === "MEMBER_INVITED" ||
        action === "MEMBER_REMOVED";

      if (isStructural) {
        console.log(`[REALTIME_SYNC][SURGICAL_V2] 🚀 Dispatching surgical event: ${action}`, {
          id: entityId,
          hasRecord: !!payload,
          isActor
        });

        window.dispatchEvent(new CustomEvent("realtime-sync-refresh", {
          detail: {
            action,
            record: { ...payload, id: entityId }, // Ensure record has the id for local lookups
            oldRecord: data.oldData,
            raw: data,
            isActor
          }
        }));
      }
    };

    // 2. Subscribe to events
    const unsubscribeActivity = pubsub.subscribe(EVENTS.APP_ACTIVITY_LOG, (data: any) => {
      const isActor = data.userId === session?.user?.id;

      // 1. Show Toast for others
      if (data.message && !isActor) {
        toast.info(data.message, {
          description: data.action?.replace(/_/g, " ").toLowerCase(),
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
    };
  }, [
    workspaceId,
    projectId,
    session?.user?.id,
    router,
  ]);

  return null;
}
