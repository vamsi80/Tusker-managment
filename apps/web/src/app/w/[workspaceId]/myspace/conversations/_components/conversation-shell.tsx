"use client";

import { ReactNode, useRef } from "react";
import { useParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { useFillViewport } from "@/hooks/use-fill-viewport";

interface ConversationShellProps {
  sidebar: ReactNode;
  children: ReactNode;
}

export function ConversationShell({ sidebar, children }: ConversationShellProps) {
  const { conversationId } = useParams();
  // Ends where the screen does, same bottom gap as every page; the calc class
  // is only the first-paint fallback.
  const shellRef = useRef<HTMLDivElement>(null);
  useFillViewport(shellRef, { property: "height" });

  return (
    <div ref={shellRef} className="flex h-[calc(100vh-140px)] w-full overflow-hidden">
      {/* Sidebar Panel */}
      <div
        className={cn(
          "w-full lg:w-80 border-r flex flex-col shrink-0 bg-muted/10",
          conversationId ? "hidden lg:flex" : "flex"
        )}
      >
        {sidebar}
      </div>

      {/* Main Chat Panel */}
      <div
        className={cn(
          "flex-1 flex flex-col min-w-0 relative",
          conversationId ? "flex" : "hidden lg:flex"
        )}
      >
        {children}
      </div>
    </div>
  );
}
