type MessageHandler = (event: string, data: Record<string, unknown>) => void;

// Reconnect backoff bounds. A persistent outage now costs at most ~1 attempt / MAX_RECONNECT_MS
// (with jitter) instead of one Worker `/ws-ticket` request every fixed 3s, and pauses entirely
// while the tab is backgrounded.
const BASE_RECONNECT_MS = 1000;
const MAX_RECONNECT_MS = 30000;

export class WorkspaceWsClient {
    private ws: WebSocket | null = null;
    private handlers: MessageHandler[] = [];
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private closed = false;
    private attempt = 0;
    private pendingReconnect = false; // reconnect wanted but deferred while tab is hidden
    private visibilityHandler: (() => void) | null = null;
    private hasOpened = false;
    private openHandlers: (() => void)[] = [];

    constructor(
        private readonly wsServerUrl: string,
        private readonly workspaceId: string,
        private readonly getTicket: () => Promise<string>,
    ) {}

    async connect() {
        this.closed = false;
        this.ensureVisibilityListener();
        try {
            const ticket = await this.getTicket();
            const proto = this.wsServerUrl.startsWith("https") ? "wss" : "ws";
            const base = this.wsServerUrl.replace(/^https?/, proto);
            const url = `${base}/ws?workspaceId=${this.workspaceId}&ticket=${encodeURIComponent(ticket)}`;

            this.ws = new WebSocket(url);

            this.ws.onopen = () => {
                // Healthy connection — reset backoff so the next blip recovers fast.
                this.attempt = 0;
                const wasReconnect = this.hasOpened;
                this.hasOpened = true;
                // On RE-connect, notify listeners so they can reconcile any events
                // missed while disconnected (the initial connect needs no reconcile —
                // consumers load on mount).
                if (wasReconnect) this.openHandlers.forEach((h) => h());
            };

            this.ws.onmessage = (e) => {
                try {
                    const { event, data } = JSON.parse(e.data);
                    this.handlers.forEach(h => h(event, data));
                } catch { /* ignore malformed messages */ }
            };

            this.ws.onclose = (e) => {
                // 4001 = missing params, 4003 = invalid ticket — do not reconnect
                if (!this.closed && e.code !== 4001 && e.code !== 4003) {
                    this.scheduleReconnect();
                }
            };

            this.ws.onerror = () => {
                this.ws?.close();
            };
        } catch {
            if (!this.closed) this.scheduleReconnect();
        }
    }

    private scheduleReconnect() {
        if (this.reconnectTimer || this.closed) return;

        // Pause reconnection while the tab is backgrounded — resume on visibilitychange.
        // Backgrounded tabs are the worst offenders for runaway reconnect traffic.
        if (typeof document !== "undefined" && document.visibilityState === "hidden") {
            this.pendingReconnect = true;
            return;
        }

        // Exponential backoff with full jitter, capped at MAX_RECONNECT_MS.
        const ceiling = Math.min(MAX_RECONNECT_MS, BASE_RECONNECT_MS * 2 ** this.attempt);
        const delay = Math.random() * ceiling;
        this.attempt++;

        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, delay);
    }

    private ensureVisibilityListener() {
        if (this.visibilityHandler || typeof document === "undefined") return;
        this.visibilityHandler = () => {
            if (document.visibilityState === "visible" && this.pendingReconnect && !this.closed) {
                this.pendingReconnect = false;
                this.scheduleReconnect();
            }
        };
        document.addEventListener("visibilitychange", this.visibilityHandler);
    }

    onMessage(handler: MessageHandler) {
        this.handlers.push(handler);
        return () => {
            this.handlers = this.handlers.filter(h => h !== handler);
        };
    }

    /** Fires after a successful RE-connect (not the first connect). */
    onOpen(handler: () => void) {
        this.openHandlers.push(handler);
        return () => {
            this.openHandlers = this.openHandlers.filter(h => h !== handler);
        };
    }

    disconnect() {
        this.closed = true;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.visibilityHandler && typeof document !== "undefined") {
            document.removeEventListener("visibilitychange", this.visibilityHandler);
            this.visibilityHandler = null;
        }
        this.pendingReconnect = false;
        this.ws?.close();
        this.ws = null;
    }
}
