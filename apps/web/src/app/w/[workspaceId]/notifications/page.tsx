"use client";

import { Bell } from "lucide-react";

export default function NotificationsIndexPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8 space-y-4">
      <div className="size-20 bg-primary/5 flex items-center justify-center text-primary/20">
        <Bell className="size-10" />
      </div>
      <div className="max-w-xs space-y-2">
        <h3 className="text-xl font-medium tracking-tight">Your Notifications</h3>
        <p className="text-sm text-muted-foreground font-normal">
          Select a notification from the list to view task details, status, activity, and comments.
        </p>
      </div>
    </div>
  );
}
