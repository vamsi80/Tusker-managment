class PerformanceLogger {
    private isEnabled: boolean;

    constructor() {
        this.isEnabled =
            (typeof process !== "undefined" && process.env?.ENABLE_PERF_LOGS === "true") ||
            (typeof process !== "undefined" && process.env?.NODE_ENV === "development");
    }

    perf(label: string, duration: number, metadata: Record<string, unknown> = {}) {
        if (!this.isEnabled) return;
        const metaStr = Object.keys(metadata).length > 0 ? ` | ${JSON.stringify(metadata)}` : "";
        console.log(`[PERF] ${label}: ${duration.toFixed(2)}ms${metaStr}`);
    }

    serverPerf(label: string, duration: number, metadata: Record<string, unknown> = {}) {
        if (!this.isEnabled) return;
        const metaStr = Object.keys(metadata).length > 0 ? ` | ${JSON.stringify(metadata)}` : "";
        console.log(`[PERF:SERVER] ${label}: ${duration.toFixed(2)}ms${metaStr}`);
    }
}

export const logger = new PerformanceLogger();
