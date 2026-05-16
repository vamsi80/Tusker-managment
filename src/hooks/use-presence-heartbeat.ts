"use client";

import { useEffect } from "react";

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
    const interval = setInterval(() => sendHeartbeat('active'), 60000);

    return () => {
      window.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('beforeunload', onBeforeUnload);
      clearInterval(interval);
    };
  }, [workspaceId]);
}
