"use client";

import { useEffect, useMemo, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { useWorkspaceLayout } from "./workspace-layout-context";

const COLS = 8;
const ROWS = 6;

// [face, shade] per balloon, kept saturated enough to read against either theme
const COLORS: [string, string][] = [
  ["#ff5d8f", "#b3164a"],
  ["#ffd166", "#c98a06"],
  ["#5fc9f8", "#0f6f9e"],
  ["#a685ff", "#5a34b8"],
  ["#4ade80", "#15803d"],
  ["#ff8f5d", "#c1440e"],
];

/**
 * Builds the curtain: one balloon per grid cell, each flying in from whichever
 * screen edge it sits nearest, then rising on a sway of its own.
 */
function useBalloons() {
  return useMemo(
    () =>
      Array.from({ length: COLS * ROWS }, (_, i) => {
        const col = i % COLS;
        const row = Math.floor(i / COLS);
        const fromLeft = col / (COLS - 1); // 0 = left edge, 1 = right edge
        const fromTop = row / (ROWS - 1);

        // Nearest edge decides where this balloon enters from
        const edges = [
          { d: fromLeft, x: "-120vw", y: "0vh" },
          { d: 1 - fromLeft, x: "120vw", y: "0vh" },
          { d: fromTop, x: "0vw", y: "-120vh" },
          { d: 1 - fromTop, x: "0vw", y: "120vh" },
        ];
        const edge = edges.reduce((a, b) => (a.d <= b.d ? a : b));

        const [color, shade] = COLORS[(col + row * 2) % COLORS.length];
        const jitter = ((i * 37) % 11) / 10; // 0 - 1, deterministic

        return {
          color,
          shade,
          fromX: edge.x,
          fromY: edge.y,
          tilt: `${(col % 2 ? -1 : 1) * (3 + (row % 3) * 2)}deg`,
          delay: `${((col + row) % 6) * 0.07 + jitter * 0.12}s`,
          sway: `${(col % 2 ? -1 : 1) * (4 + jitter * 7)}vw`,
          riseDur: `${2.1 + jitter * 1.4}s`,
          riseDelay: `${1.2 + jitter * 0.7}s`,
          scale: 0.92 + jitter * 0.16,
        };
      }),
    []
  );
}

/**
 * Fires on every load of the birthday member's own screen - reload or fresh
 * login. Mounted in the workspace shell, so an in-app route change does not
 * re-fire it.
 */
export function BirthdayCelebration() {
  const { workspaceId } = useWorkspaceLayout();
  const [playing, setPlaying] = useState(false);
  const balloons = useBalloons();

  useEffect(() => {
    if (!workspaceId) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    apiClient.workspaces
      .getBirthdays(workspaceId)
      .then((members) => {
        if (cancelled || !members.some((m) => m.isSelf && m.isToday)) return;
        setPlaying(true);

        // Paper bits, thrown as the message is uncovered
        timers.push(
          setTimeout(async () => {
            const confetti = (await import("canvas-confetti")).default;
            if (cancelled) return;
            const shared = { ticks: 260, disableForReducedMotion: true, zIndex: 101 };
            confetti({ ...shared, particleCount: 120, spread: 95, startVelocity: 45, origin: { y: 0.62 } });
            confetti({ ...shared, particleCount: 70, angle: 60, spread: 70, origin: { x: 0, y: 0.75 } });
            confetti({ ...shared, particleCount: 70, angle: 120, spread: 70, origin: { x: 1, y: 0.75 } });
          }, 1600)
        );

        timers.push(setTimeout(() => setPlaying(false), 6000));
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [workspaceId]);

  if (!playing) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[100] overflow-hidden">
      {/* Revealed as the curtain lifts */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="birthday-message px-6 text-center">
          <p className="bg-gradient-to-r from-pink-500 via-fuchsia-500 to-amber-400 bg-clip-text text-5xl font-extrabold text-transparent drop-shadow-sm sm:text-7xl">
            Happy Birthday!
          </p>
          <p className="mt-3 text-base text-muted-foreground sm:text-lg">
            Wishing you a wonderful year ahead 🎂
          </p>
        </div>
      </div>

      {/* Curtain scrim: lifts as one, so the message wipes into view */}
      <div className="birthday-curtain-scrim absolute inset-0 bg-gradient-to-b from-pink-100/95 via-fuchsia-100/90 to-amber-50/95 backdrop-blur-[2px] dark:from-pink-950/95 dark:via-fuchsia-950/90 dark:to-amber-950/95" />

      {/* Balloons: fill the screen, then each takes its own path up */}
      <div
        className="absolute inset-0 grid"
        style={{
          gridTemplateColumns: `repeat(${COLS}, 1fr)`,
          gridTemplateRows: `repeat(${ROWS}, 1fr)`,
        }}
      >
        {balloons.map((b, i) => (
          <div
            key={i}
            className="birthday-float flex items-center justify-center"
            style={
              {
                "--sway": b.sway,
                "--rise-dur": b.riseDur,
                "--rise-delay": b.riseDelay,
              } as React.CSSProperties
            }
          >
            <div
              className="birthday-balloon flex h-full w-full items-center justify-center"
              style={
                {
                  "--from-x": b.fromX,
                  "--from-y": b.fromY,
                  "--delay": b.delay,
                } as React.CSSProperties
              }
            >
              <div
                className="birthday-bob flex flex-col items-center"
                style={
                  {
                    "--tilt": b.tilt,
                    "--delay": b.delay,
                    width: `${b.scale * 100}%`,
                  } as React.CSSProperties
                }
              >
                <div
                  className="balloon-3d"
                  style={
                    { "--balloon-color": b.color, "--balloon-shade": b.shade } as React.CSSProperties
                  }
                />
                <div className="balloon-string" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
