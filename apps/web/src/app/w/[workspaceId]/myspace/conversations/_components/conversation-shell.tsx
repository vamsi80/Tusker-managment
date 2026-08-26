"use client";

import { ReactNode } from "react";
import { useParams } from "next/navigation";
import { cn } from "@/lib/utils";

interface ConversationShellProps {
  sidebar: ReactNode;
  children: ReactNode;
}

export function ConversationShell({ sidebar, children }: ConversationShellProps) {
  const { conversationId } = useParams();

  return (
    <div className="flex h-[calc(100vh-140px)] w-full overflow-hidden bg-background">
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
          "flex-1 flex flex-col min-w-0 bg-background relative",
          conversationId ? "flex" : "hidden lg:flex"
        )}
      >
        {children}
      </div>
    </div>
  );
}
