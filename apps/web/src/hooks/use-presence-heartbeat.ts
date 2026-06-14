"use client";

import { useEffect } from "react";

// Presence heartbeat interval. 3 min is plenty for "online in the last few minutes" indicators
// and cuts heartbeat traffic ~3x vs the old 60s (1,440/day/tab → ~480/day/tab).
// TODO: eliminate the HTTP heartbeat entirely by deriving presence from the WebSocket
// connect/disconnect lifecycle on the tusker-ws server (separate repo).
const HEARTBEAT_MS = 180_000;

export function usePresenceHeartbeat(workspaceId: string | undefined) {
  useEffect(() => {
    if (!workspaceId) return;

    const sendHeartbeat = async (status: 'active' | 'offline' = 'active') => {
      // Don't send periodic heartbeats if tab is hidden
      if (status === 'active' && document.visibilityState !== 'visible') return;

      try {
        if (status === 'active') console.log("💓 [Presence] Heartbeat...");
        
        await fetch(`/api/v1/presence/${workspaceId}`, { 
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
          keepalive: status === 'offline'
        });
      } catch (e) {
        if (status === 'active') console.error("❌ [Presence] Heartbeat failed:", e);
      }
    };

    // Initial ping
    sendHeartbeat('active');

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        sendHeartbeat('active');
      }
    };

    const onBeforeUnload = () => {
      sendHeartbeat('offline');
    };

    window.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('beforeunload', onBeforeUnload);
    
    // Heartbeat interval
    const interval = setInterval(() => sendHeartbeat('active'), HEARTBEAT_MS);

    return () => {
      window.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('beforeunload', onBeforeUnload);
      clearInterval(interval);
    };
  }, [workspaceId]);
}
