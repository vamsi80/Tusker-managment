"use client";

import { useEffect } from "react";

export function usePresenceHeartbeat(workspaceId: string | undefined) {
  useEffect(() => {
    if (!workspaceId) return;

    const heartbeatUrl = `/api/v1/presence/${workspaceId}`;
    let disposed = false;
    let activeRequest: AbortController | null = null;
    const isOffline = () => !navigator.onLine;

    const sendHeartbeat = async () => {
      if (
        disposed ||
        document.visibilityState !== "visible" ||
        isOffline()
      ) {
        return;
      }

      activeRequest?.abort();
      const controller = new AbortController();
      activeRequest = controller;

      try {
        const response = await fetch(heartbeatUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "active" }),
          cache: "no-store",
          signal: controller.signal,
        });

        // A signed-out session is expected during logout/navigation. Other
        // HTTP failures remain visible as diagnostics without crashing the UI.
        if (!response.ok && response.status !== 401) {
          console.warn(`[Presence] Heartbeat returned HTTP ${response.status}`);
        }
      } catch (error) {
        // Navigation, visibility changes, dev-server restarts, and brief
        // offline periods can terminate fetch. Presence is best-effort.
        if (controller.signal.aborted || disposed || isOffline()) return;

        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[Presence] Heartbeat unavailable: ${message}`);
      } finally {
        if (activeRequest === controller) activeRequest = null;
      }
    };

    const sendOffline = () => {
      const payload = JSON.stringify({ status: "offline" });

      if (navigator.sendBeacon) {
        navigator.sendBeacon(
          heartbeatUrl,
          new Blob([payload], { type: "application/json" }),
        );
        return;
      }

      void fetch(heartbeatUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => undefined);
    };

    void sendHeartbeat();

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void sendHeartbeat();
      }
    };

    const onOnline = () => void sendHeartbeat();

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("online", onOnline);
    window.addEventListener("pagehide", sendOffline);

    const interval = window.setInterval(() => void sendHeartbeat(), 60_000);

    return () => {
      disposed = true;
      activeRequest?.abort();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("pagehide", sendOffline);
      window.clearInterval(interval);
    };
  }, [workspaceId]);
}
