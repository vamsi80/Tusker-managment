import { apiFetch } from "./api-client/fetch-wrapper";

type EventCallback = (data: Record<string, unknown>) => void;

// Polling cadence: fast while the user is interacting, slow when idle-but-visible,
// fully paused when the tab is hidden. No WebSocket → cannot loop or drop.
const POLL_ACTIVE_MS = 5000;
const POLL_IDLE_MS = 30000;
const IDLE_AFTER_MS = 60000;

interface ChangeEvent {
    action: string;
    entityType: string | null;
    entityId: string | null;
    userId: string;
    userName: string;
    message: string;
    metadata: unknown;
    createdAt: string;
}

interface ChangesResponse {
    events: ChangeEvent[];
    unreadCount: number;
    activeUserIds: string[];
    serverTime: string;
}

/**
 * Realtime via polling. Public API (init/cleanup/subscribe/publish/EVENTS) is unchanged
 * from the old WebSocket version, so every consumer keeps working — only the SOURCE
 * changed from a socket to a single visible-only poll of /workspaces/:id/changes.
 */
class RealtimeService {
    private events: { [key: string]: EventCallback[] } = {};
    private currentWorkspaceId: string | null = null;
    private currentUserId: string | null = null;
    private cursor: string | null = null;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private inFlight = false;
    private lastActivityAt = Date.now();
    private visibilityHandler: (() => void) | null = null;
    private activityHandler: (() => void) | null = null;

    init(workspaceId: string, userId?: string) {
        if (this.currentWorkspaceId === workspaceId && this.currentUserId === userId) return;
        if (this.currentWorkspaceId) this.cleanup();

        this.currentWorkspaceId = workspaceId;
        this.currentUserId = userId || null;
        this.cursor = null;
        console.log(`[REALTIME_SERVICE] Polling started for workspace: ${workspaceId}`);

        if (typeof document !== "undefined") {
            this.visibilityHandler = () => {
                if (document.visibilityState === "visible") {
                    this.lastActivityAt = Date.now();
                    this.scheduleNext(0); // resume immediately on focus
                }
            };
            document.addEventListener("visibilitychange", this.visibilityHandler);

            this.activityHandler = () => { this.lastActivityAt = Date.now(); };
            window.addEventListener("pointerdown", this.activityHandler, { passive: true });
            window.addEventListener("keydown", this.activityHandler, { passive: true });
        }

        // Defer the FIRST poll by one active interval so it doesn't pile onto the
        // initial page-load burst. The unread count / shell data already arrive via
        // the /layout payload, so nothing critical is delayed; realtime activity and
        // presence simply start one tick (POLL_ACTIVE_MS) later. Visibility-resume
        // below still polls immediately.
        this.scheduleNext(POLL_ACTIVE_MS);
    }

    private scheduleNext(delay: number) {
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => this.poll(), delay);
    }

    private nextDelay() {
        const idle = Date.now() - this.lastActivityAt > IDLE_AFTER_MS;
        return idle ? POLL_IDLE_MS : POLL_ACTIVE_MS;
    }

    private async poll() {
        // Paused while hidden — the visibility handler resumes us.
        if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
        if (!this.currentWorkspaceId || this.inFlight) {
            this.scheduleNext(this.nextDelay());
            return;
        }

        this.inFlight = true;
        try {
            const qs = this.cursor ? `?since=${encodeURIComponent(this.cursor)}` : "";
            const res = await apiFetch<{ success: boolean; data: ChangesResponse }>(
                `/workspaces/${this.currentWorkspaceId}/changes${qs}`,
            );
            if (res?.data) {
                this.cursor = res.data.serverTime;
                this.dispatch(res.data);
            }
        } catch {
            // Transient failure — just retry on the next tick.
        } finally {
            this.inFlight = false;
            this.scheduleNext(this.nextDelay());
        }
    }

    private dispatch(data: ChangesResponse) {
        // Bell count (server is the source of truth — no extra request).
        this.publish(EVENTS.UNREAD_COUNT, { count: data.unreadCount });

        // Presence — emit "active" for currently-online users; inactive users simply
        // age out as their lastActiveAt stops refreshing.
        for (const uid of data.activeUserIds) {
            this.publish(EVENTS.PRESENCE_UPDATE, { userId: uid, status: "active", lastActiveAt: data.serverTime });
        }

        // Change events — fan out exactly like the old WS onMessage did so existing
        // consumers (stores, realtime-notification-listener, notifications) react the same.
        for (const ev of data.events) {
            const payload: Record<string, unknown> = {
                ...ev,
                pusherEventId: `${ev.entityId}-${ev.action}-${ev.createdAt}`,
            };
            this.publish(EVENTS.TEAM_UPDATE, payload);
            this.publish(EVENTS.APP_ACTIVITY_LOG, payload);

            const action = (ev.action || "").toUpperCase();
            if (action.includes("TASK") || ev.entityType === "TASK" || ev.entityType === "SUBTASK") {
                this.publish(EVENTS.TASK_UPDATE, payload);
            } else if (action.includes("PROJECT")) {
                this.publish(EVENTS.PROJECT_UPDATE, payload);
            } else if (action.includes("MEMBER") || action.includes("INVITE")) {
                this.publish(EVENTS.MEMBER_UPDATE, payload);
            } else if (action.includes("ATTENDANCE") || action.includes("CHECKED") || action.includes("LEAVE")) {
                this.publish(EVENTS.ATTENDANCE_UPDATE, payload);
            }
        }
    }

    cleanup() {
        if (this.timer) { clearTimeout(this.timer); this.timer = null; }
        if (this.visibilityHandler && typeof document !== "undefined") {
            document.removeEventListener("visibilitychange", this.visibilityHandler);
        }
        if (this.activityHandler && typeof window !== "undefined") {
            window.removeEventListener("pointerdown", this.activityHandler);
            window.removeEventListener("keydown", this.activityHandler);
        }
        this.visibilityHandler = null;
        this.activityHandler = null;
        this.currentWorkspaceId = null;
        this.currentUserId = null;
        this.cursor = null;
        console.log(`[REALTIME_SERVICE] Polling stopped`);
    }

    subscribe(event: string, callback: EventCallback) {
        if (!this.events[event]) this.events[event] = [];
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
    RECONNECTED: "reconnected",
    UNREAD_COUNT: "unread_count",
} as const;
