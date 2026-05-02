"use client";

import { useEffect, useTransition } from "react";
import { toast } from "sonner";
import { useParams, useRouter } from "next/navigation";
import { pubsub, EVENTS } from "@/lib/pubsub";
import { authClient } from "@/lib/auth-client";
import { useTaskCacheStore } from "@/lib/store/task-cache-store";

export function RealtimeNotificationListener() {
  // Version check for debugging stale code
  if (typeof window !== "undefined") {
    (window as any).__SURGICAL_VERSION__ = "V2";
  }

  const router = useRouter();
  const params = useParams();
  const { data: session } = authClient.useSession();
  const workspaceId = params?.workspaceId as string;
  const projectId = params?.projectId as string;

  // Cache store actions
  const upsertTasks = useTaskCacheStore((state) => state.upsertTasks);
  const moveTask = useTaskCacheStore((state) => state.moveTaskBetweenKanbanColumns);
  const addTask = useTaskCacheStore((state) => state.addTaskToKanbanList);
  const removeTask = useTaskCacheStore((state) => state.removeTaskFromKanbanList);
  const addTaskToProject = useTaskCacheStore((state) => state.addTaskToProjectList);
  const addSubTask = useTaskCacheStore((state) => state.addSubTaskToList);
  const removeSubTask = useTaskCacheStore((state) => state.removeSubTaskFromList);

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
      const action = data.action || (data.type === "CREATE" ? "TASK_CREATED" : data.type === "UPDATE" ? "TASK_UPDATED" : data.type === "DELETE" ? "TASK_DELETED" : "");
      const payload = data.newData || data.payload || data.metadata?.payload || data.metadata || data;
      const entityId = data.entityId || payload?.id;

      // 🚀 SURGICAL SYNC LOGIC
      const isStructural =
        action.includes("CREATED") ||
        action.includes("DELETED") ||
        action.includes("LEAVE") ||
        action.includes("CHECKED") ||
        action === "MEMBER_INVITED" ||
        action === "MEMBER_REMOVED";

      const isUpdate = action.includes("UPDATED") || action === "COMMENT_CREATED";

      if (isStructural || action === "MEMBER_UPDATED") {
        console.log(`[REALTIME_SYNC][SURGICAL_V2] 🚀 Dispatching surgical event: ${action}`, { 
          id: entityId, 
          hasRecord: !!payload 
        });

        window.dispatchEvent(new CustomEvent("realtime-sync-refresh", {
          detail: {
            action,
            record: payload, // Use the extracted payload
            oldRecord: data.oldData,
            raw: data
          }
        }));
      }

      // If we have data, perform surgical store updates for immediate responsiveness
      if (entityId && payload) {
        if (!isActor) {
          console.log(`[REALTIME_SYNC] ⚡ Surgical update received: ${action} for entity ${entityId}`);
        }
        if (isStructural) {
          if (action === "TASK_CREATED") {
            addTask(payload, workspaceId, payload.projectId || projectId);
            addTaskToProject(payload.projectId || projectId, payload);
            addTaskToProject("__global_filter__", payload);
          } else if (action === "SUBTASK_CREATED") {
            if (payload.parentTaskId) {
              addSubTask(payload.parentTaskId, payload);
              addTaskToProject(payload.projectId || projectId, payload);
              addTaskToProject("__global_filter__", payload);

              const parent = useTaskCacheStore.getState().entities[payload.parentTaskId];
              if (parent) {
                upsertTasks([{
                  id: payload.parentTaskId,
                  updatedAt: new Date().toISOString(),
                  _count: {
                    ...(parent as any)._count,
                    subTasks: ((parent as any)._count?.subTasks || 0) + 1
                  },
                  subtaskCount: (parent.subtaskCount || 0) + 1
                }]);
              }
            }
          } else if (action === "TASK_DELETED") {
            removeTask(entityId, payload.status || "TO_DO", workspaceId, payload.projectId || projectId);
          } else if (action === "SUBTASK_DELETED") {
            if (payload.parentTaskId) {
              removeSubTask(payload.parentTaskId, entityId);
            }
          }
        }

        if (isUpdate) {
          // Handle Kanban column moves
          if (payload.status && payload.previousStatus) {
            moveTask(entityId, payload.previousStatus, payload.status, workspaceId, projectId);
          }

          // General property update
          upsertTasks([{
            ...payload,
            id: entityId,
            updatedAt: new Date().toISOString(),
          }]);

          // Comment counter increment
          if (action === "COMMENT_CREATED") {
            const currentTask = useTaskCacheStore.getState().entities[entityId];
            if (currentTask) {
              upsertTasks([{
                id: entityId,
                _count: {
                  ...currentTask._count,
                  activities: (currentTask._count?.activities || 0) + 1,
                },
              }]);
            }
          }
        }
      }
    };

    // 2. Subscribe to events
    const unsubscribeActivity = pubsub.subscribe(EVENTS.APP_ACTIVITY_LOG, (data: any) => {
      const isActor = data.userId === session?.user?.id;

      // 1. Show Toast (Non-intrusive)
      if (data.message && !isActor) {
        toast.info(data.message, {
          description: data.action.replace(/_/g, " ").toLowerCase(),
          duration: 5000,
        });
      }

      // 2. Perform Sync
      handleSurgicalSync(data);
    });

    const unsubscribeTeam = pubsub.subscribe(EVENTS.TEAM_UPDATE, (data: any) => {
      // Team update is often redundant with activity log, but handles non-activity events
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
    upsertTasks,
    moveTask,
    addTask,
    removeTask,
    addTaskToProject,
    addSubTask,
    removeSubTask,
  ]);

  return null;
}
