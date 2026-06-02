"use client";

import { NotificationsProvider } from "./_components/notifications-context";
import { NotificationsShell } from "./_components/notifications-shell";
import { NotificationList } from "./_components/notification-list";

export default function NotificationsLayout({ children }: { children: React.ReactNode }) {
  return (
    <NotificationsProvider>
      <div className="h-full bg-background">
        <NotificationsShell sidebar={<NotificationList />}>
          {children}
        </NotificationsShell>
      </div>
    </NotificationsProvider>
  );
}
