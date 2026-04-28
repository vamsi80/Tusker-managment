"use client";

import { useEffect, useTransition, useMemo } from "react";
import { toast } from "sonner";
import { useParams, useRouter } from "next/navigation";
import { pubsub, EVENTS } from "@/lib/pubsub";
import { authClient } from "@/lib/auth-client";
import { useTaskCacheStore } from "@/lib/store/task-cache-store";

// Simple debounce implementation
const debounce = (func: Function, wait: number) => {
  let timeout: NodeJS.Timeout;
  return (...args: any[]) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

export function RealtimeNotificationListener() {
  const router = useRouter();
  const params = useParams();
  const [isPending, startTransition] = useTransition();
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
      if (isActor) return;

      // Standardize action/type
      const action = data.action || (data.type === "CREATE" ? "TASK_CREATED" : data.type === "UPDATE" ? "TASK_UPDATED" : data.type === "DELETE" ? "TASK_DELETED" : "");
      const payload = data.newData || data.payload || data.metadata?.payload || data.metadata;
      const entityId = data.entityId || payload?.id;

      if (!entityId || !payload) {
        const structuralActions = ["TASK_CREATED", "SUBTASK_CREATED", "TASK_DELETED", "SUBTASK_DELETED", "MEMBER_INVITED", "MEMBER_REMOVED"];
        if (structuralActions.includes(action)) {
          startTransition(() => {
            router.refresh();
          });
        }
        return;
      }

      // 🚀 SURGICAL SYNC LOGIC
      const isStructural = action.includes("CREATED") || action.includes("DELETED");
      const isUpdate = action.includes("UPDATED") || action === "COMMENT_CREATED";

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
    };

    // 2. Subscribe to events
    const unsubscribeActivity = pubsub.subscribe(EVENTS.APP_ACTIVITY_LOG, (data: any) => {
      // 1. Show Toast (Non-intrusive)
      if (data.message && data.userId !== session?.user?.id) {
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
      // NOTE: We don't call pubsub.cleanup() here because it unsubscribes Pusher 
      // which should survive project-level navigations as long as workspace is same.
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
