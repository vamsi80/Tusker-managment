"use client";

import { useState, useEffect } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { pubsub, EVENTS } from "@/lib/pubsub";
import { useSafeNavigation } from "@/hooks/use-safe-navigation";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger
} from "@/components/ui/tooltip";
import { workspacesClient } from "@/lib/api-client/workspaces";
import { authClient } from "@/lib/auth-client";
import { useWorkspaceLayoutStore } from "@/lib/store/workspace-layout-store";

export function NotificationCenter({ workspaceId, initialPeopleCount = 0 }: { workspaceId: string, initialPeopleCount?: number }) {
    const [peopleCount, setPeopleCount] = useState(initialPeopleCount);
    const [isPulsing, setIsPulsing] = useState(false);

    const { data: session } = authClient.useSession();
    const router = useSafeNavigation();

    // Read initial count from the layout store — the store fetches it non-blocking
    // after layout loads, so no separate API call is needed on mount.
    const storeUnreadCount = useWorkspaceLayoutStore(
        (state) => state.layoutData[workspaceId]?.unreadNotificationsCount ?? initialPeopleCount
    );
    useEffect(() => {
        setPeopleCount(storeUnreadCount);
    }, [storeUnreadCount]);

    // Only used for mark-as-read refreshes (notification-count-update event)
    const fetchCount = async () => {
        if (!workspaceId) return;
        try {
            const count = await workspacesClient.getUnreadCount(workspaceId);
            setPeopleCount(count);
        } catch (err) {
            console.error("[NOTIF_CENTER] Failed to fetch unread count:", err);
        }
    };

    // Listen for Real-time Notifications via PubSub
    useEffect(() => {
        if (!workspaceId) return;

        console.log(`[NOTIF_CENTER] Listening to PubSub for workspace: ${workspaceId}`);

        const unsubscribe = pubsub.subscribe(EVENTS.APP_ACTIVITY_LOG, (data) => {
            // Pulse for new activity; the authoritative count comes from UNREAD_COUNT below.
            if (["COMMENT_CREATED", "TASK_CREATED", "SUBTASK_CREATED"].includes(data.action as string)) {
                if (data.userId !== session?.user?.id) {
                    setIsPulsing(true);
                    setTimeout(() => setIsPulsing(false), 2000);
                }
            }
        });

        // Authoritative unread count from the /changes poll (no extra request).
        const unsubCount = pubsub.subscribe(EVENTS.UNREAD_COUNT, (data) => {
            const count = data.count as number;
            if (typeof count === "number") setPeopleCount(count);
        });

        // Listen for internal mark-as-read updates from notifications context
        const handleCountUpdate = () => {
            fetchCount();
        };
        window.addEventListener("notification-count-update", handleCountUpdate);

        // On WS reconnect, re-sync the badge count from the server (source of truth).
        const unsubReconnect = pubsub.subscribe(EVENTS.RECONNECTED, () => {
            fetchCount();
        });

        return () => {
            unsubscribe();
            unsubCount();
            unsubReconnect();
            window.removeEventListener("notification-count-update", handleCountUpdate);
        };
    }, [workspaceId, session?.user?.id]);

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                        "relative size-9 rounded-full transition-all cursor-pointer",
                        isPulsing && "ring-2 ring-primary ring-offset-2 bg-primary/10"
                    )}
                    onClick={() => {
                        router.push(`/w/${workspaceId}/notifications`);
                    }}
                >
                    <Bell className={cn(
                        "h-[18px] w-[18px] transition-transform",
                        isPulsing && "scale-110 text-primary"
                    )} />
                    {peopleCount > 0 && (
                        <div
                            className={cn(
                                "absolute top-0.5 right-0.5 size-2 rounded-full bg-red-500 border-2 border-background shadow-sm",
                                isPulsing && "animate-pulse"
                            )}
                        />
                    )}
                </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-[11px] font-medium">
                <p>Activity & Comments</p>
            </TooltipContent>
        </Tooltip>
    );
}
