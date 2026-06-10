type MessageHandler = (event: string, data: any) => void;

export class WorkspaceWsClient {
    private ws: WebSocket | null = null;
    private handlers: MessageHandler[] = [];
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private closed = false;

    constructor(
        private readonly wsServerUrl: string,
        private readonly workspaceId: string,
        private readonly getTicket: () => Promise<string>,
    ) {}

    async connect() {
        this.closed = false;
        try {
            const ticket = await this.getTicket();
            const proto = this.wsServerUrl.startsWith("https") ? "wss" : "ws";
            const base = this.wsServerUrl.replace(/^https?/, proto);
            const url = `${base}/ws?workspaceId=${this.workspaceId}&ticket=${encodeURIComponent(ticket)}`;

            this.ws = new WebSocket(url);

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
        if (this.reconnectTimer) return;
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, 3000);
    }

    onMessage(handler: MessageHandler) {
        this.handlers.push(handler);
        return () => {
            this.handlers = this.handlers.filter(h => h !== handler);
        };
    }

    disconnect() {
        this.closed = true;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.ws?.close();
        this.ws = null;
    }
}
