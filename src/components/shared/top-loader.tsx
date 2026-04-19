"use client";

import React, { useEffect, useState } from "react";
import { useWorkspaceLayout } from "@/app/w/[workspaceId]/_components/workspace-layout-context";
import { cn } from "@/lib/utils";

/**
 * TopLoader Component
 * 
 * Provides a high-end, visual progress bar at the very top of the application
 * during navigation transitions. Responds to the global isNavigating state.
 */
export function TopLoader() {
  const { isNavigating } = useWorkspaceLayout();
  const [progress, setProgress] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    let fadeOutTimeout: NodeJS.Timeout;

    if (isNavigating) {
      setIsVisible(true);
      setProgress(10); // Initial kick

      // Trickle effect
      interval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 95) return prev;
          const increment = Math.random() * (prev > 80 ? 1 : 5);
          return Math.min(prev + increment, 95);
        });
      }, 300);
    } else {
      setProgress(100);
      fadeOutTimeout = setTimeout(() => {
        setIsVisible(false);
        // Short delay before resetting to 0 to prevent "back-flash"
        setTimeout(() => setProgress(0), 200);
      }, 400);
    }

    return () => {
      clearInterval(interval);
      clearTimeout(fadeOutTimeout);
    };
  }, [isNavigating]);

  if (!isVisible && progress === 0) return null;

  return (
    <div
      className={cn(
        "fixed top-0 left-0 right-0 z-[9999] h-[2px] w-full bg-transparent overflow-hidden pointer-events-none transition-opacity duration-300",
        !isVisible && "opacity-0"
      )}
    >
      <div
        className="h-full bg-primary transition-all duration-300 ease-out shadow-[0_0_8px_rgba(var(--primary),0.6)]"
        style={{ width: `${progress}%` }}
      />
      
      {/* Glow effect at the tip */}
      <div 
        className="absolute h-full w-[100px] bg-gradient-to-r from-transparent via-primary/50 to-primary shadow-[0_0_15px_var(--primary)] transition-all duration-300"
        style={{ left: `${progress - 5}%` }}
      />
    </div>
  );
}
