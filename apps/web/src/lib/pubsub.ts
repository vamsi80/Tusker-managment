import { WorkspaceWsClient } from "./ws-client";
import { apiFetch } from "./api-client/fetch-wrapper";

type EventCallback = (data: Record<string, unknown>) => void;

class RealtimeService {
    private events: { [key: string]: EventCallback[] } = {};
    private currentWorkspaceId: string | null = null;
    private currentUserId: string | null = null;
    private wsClient: WorkspaceWsClient | null = null;
    private unsubWs: (() => void) | null = null;

    init(workspaceId: string, userId?: string) {
        if (this.currentWorkspaceId === workspaceId && this.currentUserId === userId) return;

        if (this.currentWorkspaceId) {
            this.cleanup();
        }

        this.currentWorkspaceId = workspaceId;
        this.currentUserId = userId || null;
        console.log(`[REALTIME_SERVICE] Initializing for workspace: ${workspaceId}, user: ${userId || "anon"}`);

        this.wsClient = new WorkspaceWsClient(
            process.env.NEXT_PUBLIC_WS_SERVER_URL!,
            workspaceId,
            async () => {
                const res = await apiFetch<{ ticket: string }>(`/ws-ticket?workspaceId=${workspaceId}`);
                return res.ticket;
            }
        );

        this.unsubWs = this.wsClient.onMessage((event, data) => {
            console.log(`[REALTIME_SERVICE] 📥 Received ${event}:`, data.action || data.type);

            // Always publish to team_update for broad listeners
            this.publish(EVENTS.TEAM_UPDATE, data);

            const action = String(data.action || data.type || "").toUpperCase();
            const hasTaskProps = data.projectId || data.parentTaskId || data.taskSlug || data.entityType === "TASK";
            const hasProjectProps = data.entityType === "PROJECT" || (action.includes("PROJECT") && !hasTaskProps);

            if (action.includes("TASK") || event.includes("task") || hasTaskProps) {
                this.publish(EVENTS.TASK_UPDATE, data);
            } else if (action.includes("PROJECT") || event.includes("project") || hasProjectProps) {
                this.publish(EVENTS.PROJECT_UPDATE, data);
            } else if (action.includes("MEMBER") || action.includes("INVITE")) {
                this.publish(EVENTS.MEMBER_UPDATE, data);
            } else if (action.includes("ATTENDANCE") || action.includes("CHECKED") || action.includes("LEAVE") || event.includes("attendance")) {
                this.publish(EVENTS.ATTENDANCE_UPDATE, data);
            }

            if (event === "activity_log") this.publish(EVENTS.APP_ACTIVITY_LOG, data);
            if (event === "conversation_update") this.publish(EVENTS.CONVERSATION_UPDATE, data);
            if (event === "user-active") this.publish(EVENTS.PRESENCE_UPDATE, { ...data, status: "active" });
            if (event === "user-inactive") this.publish(EVENTS.PRESENCE_UPDATE, { ...data, status: "inactive" });
        });

        this.wsClient.connect();
    }

    cleanup() {
        this.unsubWs?.();
        this.unsubWs = null;
        this.wsClient?.disconnect();
        this.wsClient = null;
        this.currentWorkspaceId = null;
        this.currentUserId = null;
        console.log(`[REALTIME_SERVICE] Cleaned up`);
    }

    subscribe(event: string, callback: EventCallback) {
        if (!this.events[event]) {
            this.events[event] = [];
        }
        this.events[event].push(callback);

        return () => {
            this.events[event] = this.events[event].filter(cb => cb !== callback);
        };
    }

    private publish(event: string, data: Record<string, unknown>) {
        if (!this.events[event]) return;
        this.events[event].forEach(callback => callback(data));
    }
}

export const pubsub = new RealtimeService();

export const EVENTS = {
    APP_ACTIVITY_LOG: "app_activity_log",
    TEAM_UPDATE: "team_update",
    TASK_UPDATE: "task_update",
    PROJECT_UPDATE: "project_update",
    MEMBER_UPDATE: "member_update",
    ATTENDANCE_UPDATE: "attendance_update",
    PRESENCE_UPDATE: "presence_update",
    CONVERSATION_UPDATE: "conversation_update",
} as const;
