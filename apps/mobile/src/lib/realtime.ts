import { AppState } from "react-native";

/**
 * Realtime, mirroring apps/web/src/lib/pubsub.ts: the same Pusher channels
 * (team-{workspaceId}, user-{userId}), the same server events, re-published
 * under the same local EVENTS names so screens subscribe the way web widgets do.
 *
 * Talks the Pusher wire protocol over the platform WebSocket — pusher-js's
 * React Native build pulls in a native NetInfo module this app doesn't need.
 * Only public channels are used, so no channel auth is involved.
 */

export const EVENTS = {
    APP_ACTIVITY_LOG: "app_activity_log",
    TEAM_UPDATE: "team_update",
    TASK_UPDATE: "task_update",
    PROJECT_UPDATE: "project_update",
    MEMBER_UPDATE: "member_update",
    ATTENDANCE_UPDATE: "attendance_update",
    PRESENCE_UPDATE: "presence_update",
    CONVERSATION_UPDATE: "conversation_update",
    MEETING_UPDATE: "meeting_update",
    TYPING: "typing",
    NOTIFICATION: "new_notification",
} as const;

type Callback = (data: any) => void;

const STANDARD_EVENTS = ["team_update", "task_update", "subtask_update", "project_update", "attendance_update", "conversation_update", "meeting_update"];

class Realtime {
    private ws: WebSocket | null = null;
    private listeners: Record<string, Set<Callback>> = {};
    private channels = new Set<string>();
    private key = (process.env.EXPO_PUBLIC_PUSHER_KEY ?? "").replace(/['"]/g, "").trim();
    private cluster = (process.env.EXPO_PUBLIC_PUSHER_CLUSTER ?? "ap2").replace(/['"]/g, "").trim();
    private retry = 0;
    private retryTimer: ReturnType<typeof setTimeout> | null = null;
    private pingTimer: ReturnType<typeof setInterval> | null = null;
    private active = false;

    constructor() {
        AppState.addEventListener("change", (state) => {
            if (state === "active" && this.active && this.ws?.readyState !== WebSocket.OPEN) this.connect();
        });
    }

    init(workspaceId: string, userId?: string | null) {
        const next = new Set([`team-${workspaceId}`, ...(userId ? [`user-${userId}`] : [])]);
        const same = next.size === this.channels.size && [...next].every((c) => this.channels.has(c));
        if (same && this.ws) return;

        this.channels.forEach((c) => !next.has(c) && this.send("pusher:unsubscribe", { channel: c }));
        this.channels = next;
        this.active = true;

        if (!this.key) return;
        if (this.ws?.readyState === WebSocket.OPEN) this.channels.forEach((c) => this.send("pusher:subscribe", { channel: c }));
        else this.connect();
    }

    stop() {
        this.active = false;
        this.channels.clear();
        if (this.retryTimer) clearTimeout(this.retryTimer);
        if (this.pingTimer) clearInterval(this.pingTimer);
        try {
            this.ws?.close();
        } catch {}
        this.ws = null;
    }

    subscribe(event: string, callback: Callback) {
        (this.listeners[event] ??= new Set()).add(callback);
        return () => {
            this.listeners[event]?.delete(callback);
        };
    }

    private publish(event: string, data: any) {
        this.listeners[event]?.forEach((cb) => {
            try {
                cb(data);
            } catch (error) {
                console.warn("[realtime] listener failed", error);
            }
        });
    }

    private send(event: string, data: any) {
        if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ event, data }));
    }

    private connect() {
        if (!this.key || !this.active) return;
        try {
            this.ws?.close();
        } catch {}

        const ws = new WebSocket(`wss://ws-${this.cluster}.pusher.com/app/${this.key}?protocol=7&client=tusker-rn&version=8.0.0`);
        this.ws = ws;

        ws.onmessage = (message) => {
            let frame: any;
            try {
                frame = JSON.parse(String(message.data));
            } catch {
                return;
            }
            const data = typeof frame.data === "string" ? safeParse(frame.data) : frame.data;

            if (frame.event === "pusher:connection_established") {
                this.retry = 0;
                this.channels.forEach((c) => this.send("pusher:subscribe", { channel: c }));
                if (this.pingTimer) clearInterval(this.pingTimer);
                this.pingTimer = setInterval(() => this.send("pusher:ping", {}), 60_000);
                return;
            }
            if (frame.event?.startsWith("pusher")) return;
            this.route(frame.event, data ?? {});
        };

        ws.onclose = () => this.scheduleReconnect();
        ws.onerror = () => {
            try {
                ws.close();
            } catch {}
        };
    }

    private scheduleReconnect() {
        if (!this.active) return;
        if (this.retryTimer) clearTimeout(this.retryTimer);
        const delay = Math.min(30_000, 1000 * 2 ** this.retry++);
        this.retryTimer = setTimeout(() => this.connect(), delay);
    }

    /** Same fan-out as RealtimeService.init on the web. */
    private route(eventName: string, data: any) {
        if (eventName === "activity_log") {
            this.publish(EVENTS.APP_ACTIVITY_LOG, data);
            return;
        }
        if (eventName === "new_notification") {
            this.publish(EVENTS.NOTIFICATION, data);
            return;
        }
        if (eventName === "typing") {
            this.publish(EVENTS.TYPING, data);
            return;
        }
        if (eventName === "user-active" || eventName === "user-inactive") {
            this.publish(EVENTS.PRESENCE_UPDATE, { ...data, status: eventName === "user-active" ? "active" : "inactive" });
            return;
        }
        if (!STANDARD_EVENTS.includes(eventName)) return;

        this.publish(EVENTS.TEAM_UPDATE, data);
        const action = String(data.action || data.type || "").toUpperCase();
        const hasTaskProps = data.projectId || data.parentTaskId || data.taskSlug || data.entityType === "TASK";

        if (action.includes("MEETING") || eventName.includes("meeting")) this.publish(EVENTS.MEETING_UPDATE, data);
        else if (action.includes("TASK") || eventName.includes("task") || hasTaskProps) this.publish(EVENTS.TASK_UPDATE, data);
        else if (action.includes("PROJECT") || eventName.includes("project")) this.publish(EVENTS.PROJECT_UPDATE, data);
        else if (action.includes("MEMBER") || action.includes("INVITE")) this.publish(EVENTS.MEMBER_UPDATE, data);
        else if (action.includes("ATTENDANCE") || action.includes("CHECKED") || action.includes("LEAVE") || eventName.includes("attendance"))
            this.publish(EVENTS.ATTENDANCE_UPDATE, data);

        if (eventName === "conversation_update") this.publish(EVENTS.CONVERSATION_UPDATE, data);
    }
}

function safeParse(value: string) {
    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
}

export const realtime = new Realtime();
