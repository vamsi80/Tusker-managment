"use client";

import { useEffect } from "react";
import { pusherClient } from "@/lib/pusher";
import { toast } from "sonner";
import { useParams, useRouter } from "next/navigation";
import { TEAM_UPDATE } from "@/lib/realtime";
import { authClient } from "@/lib/auth-clint";

export function RealtimeNotificationListener() {
    const router = useRouter();
    const params = useParams();
    const { data: session } = authClient.useSession();
    const workspaceId = params?.workspaceId as string;

    useEffect(() => {
        if (!pusherClient || !workspaceId) return;

        console.log(`[REALTIME_LISTENER] Monitoring workspace: ${workspaceId}`);
        const channel = pusherClient.subscribe(`team-${workspaceId}`);

        // Handle general activity logs (used for toasts and global refreshes)
        channel.bind("activity_log", (data: any) => {
            // console.log("[REALTIME] Activity log received:", data);

            // Trigger global refresh to keep UI in sync
            router.refresh();

            // Show toast message if provided AND not triggered by the current user
            if (data.message && data.userId !== session?.user?.id) {
                toast.info(data.message, {
                    description: data.action.replace(/_/g, " ").toLowerCase(),
                    duration: 5000,
                });
            }
        });

        // Handle targeted team updates (Silent refresh only - toasts handled by activity_log)
        channel.bind(TEAM_UPDATE, (data: any) => {
            console.log("[REALTIME] Team update refresh triggered");
            router.refresh();
        });

        return () => {
            pusherClient.unsubscribe(`team-${workspaceId}`);
        };
    }, [workspaceId, router]);

    return null; // This component doesn't render anything
}
