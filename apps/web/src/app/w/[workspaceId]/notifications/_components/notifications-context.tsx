"use client";

import { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import { dedupe } from "@/lib/api-client/dedupe";
import { authClient } from "@/lib/auth-client";
import { pubsub, EVENTS } from "@/lib/pubsub";
import { toast } from "sonner";

interface NotificationItem {
  id?: string;
  taskId: string;
  taskName?: string;
  projectName?: string;
  type?: string;
  isNew?: boolean;
  latestComment?: {
    user?: { surname?: string | null; name?: string | null; image?: string | null };
    content?: string;
    createdAt?: string;
  } | null;
  [key: string]: unknown;
}

interface NotificationsContextType {
  unreadNotifications: NotificationItem[];
  readNotifications: NotificationItem[];
  unreadCount: number;
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  loadNotifications: (isInitial?: boolean) => Promise<void>;
  markRead: (taskId: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { workspaceId } = useParams();
  const [unreadNotifications, setUnreadNotifications] = useState<NotificationItem[]>([]);
  const [readNotifications, setReadNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const LIMIT = 15;

  const { data: session } = authClient.useSession();

  const loadNotifications = useCallback(async (isInitial = true) => {
    if (!workspaceId) return;

    if (isInitial) {
      setIsLoading(true);
      setNextCursor(null);
    } else {
      setIsLoadingMore(true);
    }

    const currentCursor = isInitial ? undefined : (nextCursor || undefined);
    const { data, error } = await dedupe(
      `notifications:${workspaceId}:${LIMIT}:${currentCursor ?? "initial"}`,
      () => apiClient.comments.getNotifications(workspaceId as string, LIMIT, currentCursor),
    );

    if (!error && data) {
      type NotifPayload = { unreadNotifications?: NotificationItem[]; readNotifications?: NotificationItem[]; peopleCount?: number; nextCursor?: string | null; hasMore?: boolean };
      const notifData = data as NotifPayload;
      if (isInitial) {
        setUnreadNotifications(notifData.unreadNotifications || []);
        setReadNotifications(notifData.readNotifications || []);
        setUnreadCount(notifData.peopleCount || 0);
        window.dispatchEvent(new CustomEvent("notification-count-update"));
      } else {
        setUnreadNotifications(prev => {
          const existingIds = new Set(prev.map(n => n.taskId));
          const newUnread = (notifData.unreadNotifications || []).filter((n) => !existingIds.has(n.taskId));
          return [...prev, ...newUnread];
        });
        setReadNotifications(prev => {
          const existingIds = new Set(prev.map(n => n.taskId));
          const newRead = (notifData.readNotifications || []).filter((n) => !existingIds.has(n.taskId));
          return [...prev, ...newRead];
        });
      }
      setNextCursor(notifData.nextCursor || null);
      setHasMore(notifData.hasMore || false);
    }

    setIsLoading(false);
    setIsLoadingMore(false);
  }, [workspaceId, nextCursor]);

  const markRead = useCallback(async (taskId: string) => {
    const target = unreadNotifications.find(n => n.taskId === taskId);
    if (target) {
      setUnreadNotifications(prev => prev.filter(n => n.taskId !== taskId));
      setReadNotifications(prev => [
        { ...target, isNew: false },
        ...prev
      ]);
      setUnreadCount(prev => {
        const nextCount = Math.max(0, prev - 1);
        window.dispatchEvent(new CustomEvent("notification-count-update"));
        return nextCount;
      });
    }
    await apiClient.comments.markAsRead(taskId);
  }, [unreadNotifications]);

  const markAllRead = useCallback(async () => {
    if (unreadNotifications.length === 0) return;
    
    // Optimistically empty unread
    setReadNotifications(prev => [
      ...unreadNotifications.map(n => ({ ...n, isNew: false })),
      ...prev
    ]);
    setUnreadNotifications([]);
    setUnreadCount(0);
    window.dispatchEvent(new CustomEvent("notification-count-update"));

    try {
      await apiClient.comments.markAllAsRead(workspaceId as string);
      toast.success("All notifications marked as read");
    } catch (err) {
      toast.error("Failed to mark all as read");
    }
  }, [unreadNotifications, workspaceId]);

  // Keep a ref to the latest loadNotifications so the subscription effect below does
  // NOT depend on its identity (which changes with nextCursor) — otherwise it would
  // tear down and re-subscribe to pubsub on every page of "load more".
  const loadNotificationsRef = useRef(loadNotifications);
  useEffect(() => {
    loadNotificationsRef.current = loadNotifications;
  }, [loadNotifications]);

  // Real-time subscription via pubsub
  useEffect(() => {
    if (!workspaceId) return;

    const unsubscribe = pubsub.subscribe(EVENTS.APP_ACTIVITY_LOG, (data) => {
      const action = data.action as string | undefined;
      const userId = data.userId as string | undefined;
      if (["COMMENT_CREATED", "TASK_CREATED", "SUBTASK_CREATED"].includes(action ?? "")) {
        if (userId !== session?.user?.id) {
          // Trigger a re-fetch of notifications to keep list fully accurate
          loadNotificationsRef.current(true);
        }
      }
    });

    // On reconnect, reconcile anything missed while offline (DB is source of truth).
    const unsubReconnect = pubsub.subscribe(EVENTS.RECONNECTED, () => {
      loadNotificationsRef.current(true);
    });

    return () => {
      unsubscribe();
      unsubReconnect();
    };
  }, [workspaceId, session?.user?.id]);

  useEffect(() => {
    if (workspaceId) {
      loadNotifications(true);
    }
  }, [workspaceId]);

  return (
    <NotificationsContext.Provider value={{
      unreadNotifications,
      readNotifications,
      unreadCount,
      isLoading,
      isLoadingMore,
      hasMore,
      loadNotifications,
      markRead,
      markAllRead
    }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (context === undefined) {
    throw new Error("useNotifications must be used within a NotificationsProvider");
  }
  return context;
}
