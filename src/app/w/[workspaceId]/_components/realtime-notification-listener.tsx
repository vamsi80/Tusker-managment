"use client";

import { useEffect, useTransition } from "react";
import { toast } from "sonner";
import { useParams, useRouter } from "next/navigation";
import { pubsub, EVENTS } from "@/lib/pubsub";
import { authClient } from "@/lib/auth-clint";
import { useTaskCacheStore } from "@/lib/store/task-cache-store";

export function RealtimeNotificationListener() {
    const router = useRouter();
    const params = useParams();
    const [isPending, startTransition] = useTransition();
    const { data: session } = authClient.useSession();
    const workspaceId = params?.workspaceId as string;
    const projectId = params?.projectId as string;
    const upsertTasks = useTaskCacheStore((state) => state.upsertTasks);
    const moveTask = useTaskCacheStore((state) => state.moveTaskBetweenKanbanColumns);

    useEffect(() => {
        if (!workspaceId) return;

        // 1. Initialize the central Real-Time Service with both Workspace and User context
        pubsub.init(workspaceId, session?.user?.id);

        // 2. Listen to internal events for UI updates (Toasts & Refreshes)
        const unsubscribeActivity = pubsub.subscribe(EVENTS.APP_ACTIVITY_LOG, (data: any) => {
            const isActor = data.userId === session?.user?.id;
            const isUpdate = data.action === "TASK_UPDATED" || data.action === "SUBTASK_UPDATED";

            // 🚀 SURGICAL SYNC: If it's an update, push data to store instead of full refresh
            if (!isActor && isUpdate && data.entityId && data.metadata) {
                // If it's a status change (move), handle it surgically in the store
                if (data.metadata.status && data.metadata.previousStatus) {
                    moveTask(
                        data.entityId,
                        data.metadata.previousStatus,
                        data.metadata.status,
                        workspaceId,
                        projectId
                    );
                }

                upsertTasks([{
                    id: data.entityId,
                    ...data.metadata,
                    updatedAt: new Date().toISOString()
                }]);
            } else if (!isActor) {
                // For structural changes (DELETE, CREATE) or other users' actions,
                // we still do a full refresh to ensure list integrity.
                startTransition(() => {
                    router.refresh();
                });
            }

            // Show toast message if provided AND not triggered by the current user
            if (data.message && !isActor) {
                toast.info(data.message, {
                    description: data.action.replace(/_/g, " ").toLowerCase(),
                    duration: 5000,
                });
            }
        });

        // Handle general team updates (Silent refresh)
        const unsubscribeTeam = pubsub.subscribe(EVENTS.TEAM_UPDATE, (data: any) => {
            const isActor = data?.userId === session?.user?.id;
            if (isActor) return;

            const isSurgicalUpdate = data.type === "UPDATE" && data.payload?.id;

            if (isSurgicalUpdate) {
                // Handle status moves surgically
                if (data.payload.status && data.payload.previousStatus) {
                    moveTask(
                        data.payload.id,
                        data.payload.previousStatus,
                        data.payload.status,
                        workspaceId,
                        projectId
                    );
                }

                upsertTasks([{
                    ...data.payload,
                    updatedAt: new Date().toISOString()
                }]);
            } else {
                // For other types (CREATE, DELETE, etc.), do a full refresh
                startTransition(() => {
                    router.refresh();
                });
            }
        });

        return () => {
            unsubscribeActivity();
            unsubscribeTeam();
            pubsub.cleanup();
        };
    }, [workspaceId, session?.user?.id, router]);

    return null; // This component doesn't render anything
}
