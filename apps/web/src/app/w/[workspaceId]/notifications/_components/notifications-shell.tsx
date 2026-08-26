"use client";

import { ReactNode } from "react";
import { useParams } from "next/navigation";
import { cn } from "@/lib/utils";

interface NotificationsShellProps {
  sidebar: ReactNode;
  children: ReactNode;
}

export function NotificationsShell({ sidebar, children }: NotificationsShellProps) {
  const { notificationId } = useParams();

  return (
    <div className="flex h-[calc(100vh-var(--header-height,3rem)-1.75rem)] w-full overflow-hidden bg-background">
      {/* Sidebar Panel */}
      <div
        className={cn(
          "w-full lg:w-80 border-r flex flex-col shrink-0 bg-muted/10",
          notificationId ? "hidden lg:flex" : "flex"
        )}
      >
        {sidebar}
      </div>

      {/* Main Detail Panel */}
      <div
        className={cn(
          "flex-1 flex flex-col min-w-0 bg-background relative",
          notificationId ? "flex" : "hidden lg:flex"
        )}
      >
        {children}
      </div>
    </div>
  );
}
