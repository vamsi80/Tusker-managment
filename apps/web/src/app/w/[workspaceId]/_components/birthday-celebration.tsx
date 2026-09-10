"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@tusker/api-client";
import { useWorkspaceLayout } from "./workspace-layout-context";

/**
 * Fires on every load of the birthday member's own screen - reload or fresh
 * login. Mounted in the workspace shell, so an in-app route change does not
 * re-fire it.
 */
export function BirthdayCelebration() {
  const { workspaceId } = useWorkspaceLayout();
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!workspaceId) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let cancelled = false;

    apiClient.workspaces
      .getBirthdays(workspaceId)
      .then((members) => {
        if (cancelled || !members.some((m) => m.isSelf && m.isToday)) return;
        setPlaying(true);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  if (!playing) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[100] overflow-hidden bg-black">
      <video
        className="h-full w-full object-cover"
        src="/birthday.mp4"
        autoPlay
        muted
        playsInline
        // Clip runs once, then the overlay clears itself; a video that fails to
        // load never fires `ended`, so fall back to the same exit.
        onEnded={() => setPlaying(false)}
        onError={() => setPlaying(false)}
      />
    </div>
  );
}
