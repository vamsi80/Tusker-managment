"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { useNotifications } from "../_components/notifications-context";
import { NotificationDetail } from "../_components/notification-detail";

export default function NotificationDetailPage() {
  const { notificationId } = useParams();
  const { markRead } = useNotifications();

  useEffect(() => {
    if (notificationId) {
      // Optimistically trigger mark as read when detail view is loaded
      markRead(notificationId as string);
    }
  }, [notificationId, markRead]);

  if (!notificationId) return null;

  return (
    <div className="flex-1 h-full overflow-hidden">
      <NotificationDetail notificationId={notificationId as string} />
    </div>
  );
}
