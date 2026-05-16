"use client";

import { ReactNode } from "react";

interface ConversationShellProps {
  sidebar: ReactNode;
  children: ReactNode;
}

export function ConversationShell({ sidebar, children }: ConversationShellProps) {
  return (
    <div className="flex h-[calc(100vh-140px)] w-full overflow-hidden bg-background">
      {/* Sidebar Panel */}
      <div className="w-80 border-r flex flex-col shrink-0 bg-muted/10">
        {sidebar}
      </div>

      {/* Main Chat Panel */}
      <div className="flex-1 flex flex-col min-w-0 bg-background relative">
        {children}
      </div>
    </div>
  );
}
