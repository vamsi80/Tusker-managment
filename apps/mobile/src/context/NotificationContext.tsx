import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  NotificationService,
  DM_ACTION_MARK_READ,
  DM_ACTION_REPLY,
  DM_READ_TYPE,
  dismissConversationNotifications,
} from "../services/NotificationService";
import {
  registerPushToken,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getTaskById,
  sendDirectMessage,
  markConversationRead,
} from "../services/api";
import { navigationRef } from "../navigation/navigationRef";
import { useWorkspace } from "./WorkspaceContext";
import { DeviceEventEmitter, Alert } from "react-native";
import * as Haptics from "expo-haptics";
import { PusherClient } from "../services/PusherClient";
import { getCachedSession } from "../services/api";

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  receivedAt: string;
  isRead: boolean;
  data?: any;
}

interface NotificationContextType {
  notifications: NotificationItem[];
  unreadCount: number;
  loading: boolean;
  refresh: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: string) => void;
  clearAll: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(
  undefined,
);

const NOTIFICATIONS_STORAGE_KEY = "@tusker_notifications_history";

/** Push button presses already handled this session ("pushId:action"). */
const handledPushActions = new Set<string>();

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const [loading, setLoading] = useState(false);
  const refreshInProgress = React.useRef(false);
  const { activeWorkspace } = useWorkspace();

  // ─── Server Sync ──────────────────────────────────────────────────────────

  const refresh = useCallback(async () => {
    if (!activeWorkspace || refreshInProgress.current) return;

    refreshInProgress.current = true;
    setLoading(true);
    try {
      const { getActivities } = await import("../services/api");

      const tNotif = performance.now();
      // Fetch both targeted notifications and general workspace activity logs in parallel
      const [notifResult, activitiesList] = await Promise.all([
        getNotifications(activeWorkspace.id, 50, 0).catch(() => ({
          success: false,
          notifications: [],
        })),
        getActivities(activeWorkspace.id, undefined, false).catch(() => []),
      ]);
      console.log(
        `[NotificationContext] ⏱ Notifications & Activities fetched in ${(performance.now() - tNotif).toFixed(1)}ms`,
      );

      const allItems: NotificationItem[] = [];

      if (notifResult.success && notifResult.notifications) {
        const mappedNotifs = notifResult.notifications.map((n: any) => {
          let metaObj = {};
          if (n.metadata) {
            try {
              metaObj =
                typeof n.metadata === "string"
                  ? JSON.parse(n.metadata)
                  : n.metadata;
            } catch (e) {
              console.error(
                "[NotificationContext] Error parsing notification metadata:",
                e,
              );
            }
          }

          let title = n.title;
          let body = n.body;
          if (n.type === "CHECKED_IN" || n.title === "CHECKED IN") {
            title = "Check-In Update";
            if (body && !body.includes("for work")) {
              body = body.replace(/checked in$/, "checked in for work");
            }
          } else if (n.type === "CHECKED_OUT" || n.title === "CHECKED OUT") {
            title = "Check-Out Update";
          } else if (n.type === "DM_MESSAGE" || n.title === "DM MESSAGE") {
            const senderName =
              (metaObj as any)?.senderName ||
              (n.title !== "DM MESSAGE" ? n.title : "Direct Message");
            const content =
              (metaObj as any)?.content ||
              (n.body?.includes("sent you a message")
                ? (metaObj as any)?.payload?.content || n.body
                : n.body);
            title = senderName;
            body = content;
          }

          return {
            id: n.id,
            title,
            body,
            receivedAt: n.createdAt,
            isRead: n.isRead,
            data: {
              ...metaObj,
              entityId: n.entityId,
              entityType: n.entityType,
              conversationId: n.entityId || (metaObj as any)?.conversationId,
              senderId: (metaObj as any)?.senderId,
              senderName: title,
              action: n.type || "DM_MESSAGE",
              type: n.type === "DM_MESSAGE" ? "direct_message" : n.type,
            },
          };
        });
        allItems.push(...mappedNotifs);
      }

      if (activitiesList && activitiesList.length > 0) {
        activitiesList.forEach((act: any) => {
          // Prevent duplicate entries where a targeted notification was already created for the same audit event
          // We use an extended time window (2 hours) to handle Vercel serverless freezing where activity logs can be delayed in DB write
          const isDuplicate = allItems.some(
            (n) =>
              n.data?.entityId === act.entityId &&
              n.data?.action === act.action &&
              Math.abs(
                new Date(n.receivedAt).getTime() -
                  new Date(act.createdAt).getTime(),
              ) < 7200000,
          );

          if (!isDuplicate) {
            let metaObj = {};
            if (act.metadata) {
              try {
                metaObj =
                  typeof act.metadata === "string"
                    ? JSON.parse(act.metadata)
                    : act.metadata;
              } catch (e) {
                console.error(
                  "[NotificationContext] Error parsing activity metadata:",
                  e,
                );
              }
            }

            let title = act.text;
            let body = "Workspace Activity";

            if (act.action === "CHECKED_IN") {
              title = "Check-In Update";
              body = act.text;
              if (body && !body.includes("for work")) {
                body = body.replace(/checked in$/, "checked in for work");
              }
            } else if (act.action === "CHECKED_OUT") {
              title = "Check-Out Update";
              body = act.text;
            }

            allItems.push({
              id: act.id,
              title,
              body,
              receivedAt: act.createdAt,
              isRead: true, // Audit logs are implicitly read
              data: {
                ...metaObj,
                isAuditLog: true,
                entityId: act.entityId,
                entityType: act.entityType,
                action: act.action,
              },
            });
          }
        });
      }

      // Sort chronologically (newest first)
      allItems.sort(
        (a, b) =>
          new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime(),
      );

      setNotifications(allItems);
    } catch (err) {
      console.error("Failed to fetch notifications:", err);
    } finally {
      refreshInProgress.current = false;
      setLoading(false);
    }
  }, [activeWorkspace]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // ─── Notification Handler ──────────────────────────────────────────────────

  const addNotification = useCallback(
    (notif: Omit<NotificationItem, "id" | "receivedAt" | "isRead">) => {
      const newItem: NotificationItem = {
        ...notif,
        id: Math.random().toString(36).substring(7),
        receivedAt: new Date().toISOString(),
        isRead: false,
      };
      setNotifications((prev) => [newItem, ...prev]);
    },
    [],
  );

  useEffect(() => {
    // Register for permissions on mount
    const setupNotifications = async () => {
      const token =
        await NotificationService.registerForPushNotificationsAsync();
      if (token) {
        console.log("[NotificationContext] Push Token found:", token);
        console.log("[NotificationContext] Registering token with backend...");
        const res = await registerPushToken(token);
        if (res?.ok) {
          console.log("[NotificationContext] Token registered successfully");
        } else {
          console.warn(
            "[NotificationContext] Token registration failed:",
            res?.status,
          );
        }
      } else {
        console.log(
          "[NotificationContext] No push token retrieved (Check permissions or simulator)",
        );
      }
    };

    setupNotifications();

    // Listen for foreground notifications
    const foregroundSubscription =
      Notifications.addNotificationReceivedListener((response) => {
        const { title, body, data } = response.request.content;

        // A chat was read somewhere (web or app): clear its notifications,
        // quietly. In the background, BACKGROUND_PUSH_TASK does the same.
        if ((data as any)?.type === DM_READ_TYPE && typeof (data as any)?.conversationId === "string") {
          dismissConversationNotifications((data as any).conversationId).catch(() => {});
          refresh();
          return;
        }

        // Trigger refresh to get full data from server
        refresh();

        // Trigger haptic feedback
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      });

    const safeNavigate = (name: any, params?: any) => {
      if (navigationRef.isReady()) {
        (navigationRef as any).navigate(name, params);
        return;
      }
      const timer = setInterval(() => {
        if (navigationRef.isReady()) {
          clearInterval(timer);
          (navigationRef as any).navigate(name, params);
        }
      }, 100);
      setTimeout(() => clearInterval(timer), 5000);
    };

    // Handler for notification taps (Background/Killed/Foreground states)
    const handleNotificationResponse = async (
      response: Notifications.NotificationResponse,
    ) => {
      const data = response.notification.request.content.data as any;
      const title = response.notification.request.content.title;
      const body = response.notification.request.content.body;

      // Direct message notification takes top priority: opens the messages/chat screen immediately
      const actionType = data?.action || data?.type;
      if (
        (data?.type === "direct_message" ||
          actionType === "direct_message" ||
          actionType === "DM_MESSAGE") &&
        (data?.conversationId || data?.entityId)
      ) {
        const targetConversationId = (data.conversationId ||
          data.entityId) as string;

        // Reply / Mark as read buttons on the push (NotificationService
        // registers them). The last response is cleared once handled, or the
        // cold-start check below would replay it and send a reply twice.
        const action = response.actionIdentifier;
        if (action === DM_ACTION_REPLY || action === DM_ACTION_MARK_READ) {
          Notifications.clearLastNotificationResponse();
          const pushId = response.notification.request.identifier;
          // On a cold start the same press can arrive twice (listener + last
          // response): handle it once.
          if (handledPushActions.has(`${pushId}:${action}`)) return;
          handledPushActions.add(`${pushId}:${action}`);
          const text = response.userText?.trim();
          let failedText: string | null = null;
          if (action === DM_ACTION_REPLY && text) {
            if (!(await sendDirectMessage(targetConversationId, text))) failedText = text;
          }
          // Replying also means you've read it.
          if (data.workspaceId) {
            await markConversationRead(data.workspaceId as string, targetConversationId);
          }
          await Notifications.dismissNotificationAsync(pushId).catch(() => {});
          refresh();
          if (failedText) {
            // Never lose a typed reply silently: say so, with the text.
            Alert.alert("Message not sent", `"${failedText}"\n\nOpen the chat and send it again.`);
          }
          if (action === DM_ACTION_MARK_READ) return;
          // Reply opened the app: land in the chat, showing the reply.
        }

        const senderName =
          (data.senderName as string) ||
          (title && title !== "DM MESSAGE" ? title : "Chat");
        safeNavigate("DirectChat", {
          conversationId: targetConversationId,
          otherUserId: data.senderId as string,
          otherUserName: senderName,
        });
        return;
      }

      if (
        data?.entityId &&
        typeof data.entityId === "string" &&
        (data?.entityType === "TASK" || data?.entityType === "SUBTASK")
      ) {
        let isSubtask =
          data.entityType === "SUBTASK" ||
          (typeof actionType === "string" && actionType.includes("SUBTASK"));
        let pId: string | undefined =
          typeof data.projectId === "string" ? data.projectId : undefined;
        let projName = "Project";
        let apiTask = null;

        try {
          apiTask = await getTaskById(data.entityId);
          if (apiTask) {
            isSubtask = !!apiTask.parentTaskId;
            if (apiTask.projectId) pId = apiTask.projectId;
            if (apiTask.project?.name) projName = apiTask.project.name;
          }
        } catch (err) {
          console.error("Error looking up task in notification tap:", err);
        }

        if (!apiTask) {
          safeNavigate("TaskDetail", {
            taskId: data.entityId,
            taskName: isSubtask
              ? `Subtask #${data.entityId.slice(-4)}`
              : `Task #${data.entityId.slice(-4)}`,
            notificationTitle: title || undefined,
            notificationBody: body || undefined,
            isSubtask: isSubtask,
            taskData: data,
          });
          return;
        }

        if (actionType === "COMMENT_CREATED") {
          safeNavigate("TaskDetail", {
            taskId: data.entityId,
            taskName: isSubtask
              ? `Subtask #${data.entityId.slice(-4)}`
              : `Task #${data.entityId.slice(-4)}`,
            openMessages: true,
            notificationTitle: title || undefined,
            notificationBody: body || undefined,
            isSubtask: isSubtask,
            taskData: data,
          });
        } else if (
          actionType === "TASK_CREATED" ||
          actionType === "TASK_UPDATED" ||
          (!isSubtask && data.entityType === "TASK")
        ) {
          if (pId) {
            safeNavigate("ProjectDetail", {
              projectId: pId,
              projectName: projName,
              initialTab: "Tasks",
            });
          } else {
            safeNavigate("TaskDetail", {
              taskId: data.entityId,
              taskName: title || "Task Details",
              notificationTitle: title || undefined,
              notificationBody: body || undefined,
              isSubtask: isSubtask,
              taskData: data,
            });
          }
        } else {
          safeNavigate("TaskDetail", {
            taskId: data.entityId,
            taskName: isSubtask
              ? `Subtask #${data.entityId.slice(-4)}`
              : `Task #${data.entityId.slice(-4)}`,
            notificationTitle: title || undefined,
            notificationBody: body || undefined,
            isSubtask: isSubtask,
            taskData: data,
          });
        }
      } else if (
        data?.entityType === "MEMBER" &&
        (actionType === "MEMBER_INVITED" || actionType === "MEMBER_REMOVED")
      ) {
        const isInvite = actionType === "MEMBER_INVITED";
        const alertTitle = isInvite ? "Member Invited" : "Member Removed";

        // Get target user's name/surname
        let targetName: string | null =
          data?.newData?.surname ||
          data?.payload?.surname ||
          data?.newData?.name ||
          data?.payload?.name ||
          data?.surname ||
          data?.name ||
          null;

        const detail = targetName
          ? isInvite
            ? `${targetName} was invited to the workspace`
            : `${targetName} was removed from the workspace`
          : body ||
            (isInvite
              ? "System invited a new member"
              : "System removed a member");

        safeNavigate("Notifications");

        Alert.alert(alertTitle, detail, [{ text: "OK", style: "cancel" }]);
      } else if (
        // Real AuditAction values (audit.ts)
        actionType === "LEAVE_REQUESTED" ||
        actionType === "LEAVE_APPROVED" ||
        actionType === "LEAVE_REJECTED" ||
        actionType === "LEAVE_DELETED"
      ) {
        if (actionType === "LEAVE_REQUESTED") {
          safeNavigate("Main", {
            screen: "Home",
            params: { screen: "AdminLeave" },
          });
        } else {
          safeNavigate("Main", { screen: "Home", params: { screen: "Leave" } });
        }
      } else if (actionType === "CHECKED_IN" || actionType === "CHECKED_OUT") {
        safeNavigate("Main", {
          screen: "Home",
          params: { screen: "Attendance" },
        });
      } else {
        safeNavigate("Main", {
          screen: "Home",
          params: { screen: "Notifications" },
        });
      }
    };

    // Listen for notification taps (Background/Foreground state)
    const responseSubscription =
      Notifications.addNotificationResponseReceivedListener(
        handleNotificationResponse,
      );

    // Check if the app was launched by tapping a push notification from killed state
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) {
          handleNotificationResponse(response);
        }
      })
      .catch(() => {});

    // --- Real-time WebSocket (Pusher) Setup ---
    let pusher: import("../services/PusherClient").PusherClient | null = null;
    let teamChannel: any = null;
    let userChannel: any = null;

    const setupPusher = async () => {
      const pusherKey = process.env.EXPO_PUBLIC_PUSHER_KEY;
      const pusherCluster = process.env.EXPO_PUBLIC_PUSHER_CLUSTER;

      if (!pusherKey || !pusherCluster || !activeWorkspace) return;

      pusher = new PusherClient(pusherKey, { cluster: pusherCluster });

      const handleLiveUpdate = (data: any) => {
        // Instantly fetch latest notifications
        refresh();
        // Emit an app-wide event so the Dashboard and Task lists can refresh silently
        DeviceEventEmitter.emit("remote_update", data);
        // Optional haptic feedback for important live events
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      };

      // Subscribe to workspace-wide activity. The server only ever
      // triggers "activity_log" on per-user channels (see audit.ts),
      // never here — this channel's live signal is "conversation_update",
      // broadcast by the POST /messages route so every participant's
      // conversation list refreshes, not just the two people involved.
      teamChannel = pusher.subscribe(`team-${activeWorkspace.id}`);
      teamChannel.bind("conversation_update", handleLiveUpdate);

      // Subscribe to user-specific targeted events
      const session = await getCachedSession();
      if (session?.user?.id) {
        userChannel = pusher.subscribe(`user-${session.user.id}`);
        userChannel.bind("activity_log", handleLiveUpdate);
        userChannel.bind("new_notification", handleLiveUpdate);
        userChannel.bind("new-message", handleLiveUpdate);
        // Most business events (task/comment/leave/attendance/member/
        // workspace changes) broadcast under these names instead —
        // see recordActivity's `broadcastEvent` in packages/core's
        // audit.ts. Without binding them, the socket receives the
        // messages but nothing is listening, so nothing ever updates.
        userChannel.bind("team_update", handleLiveUpdate);
        userChannel.bind("workspace_update", handleLiveUpdate);
        userChannel.bind("conversation_update", handleLiveUpdate);
      }
    };

    setupPusher();

    return () => {
      foregroundSubscription.remove();
      responseSubscription.remove();

      if (pusher) {
        if (teamChannel) pusher.unsubscribe(teamChannel.name);
        if (userChannel) pusher.unsubscribe(userChannel.name);
        pusher.disconnect();
      }
    };
  }, [addNotification, activeWorkspace, refresh]);

  // ─── Actions ──────────────────────────────────────────────────────────────

  const markAsRead = async (id: string) => {
    const item = notifications.find((n) => n.id === id);
    if (item?.data?.isAuditLog) return; // Audit logs are implicitly read, skip DB update

    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
    );
    await markNotificationRead(id).catch((e) =>
      console.log("[NotificationContext] Failed to mark read:", e),
    );
  };

  const markAllAsRead = async () => {
    if (!activeWorkspace) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    await markAllNotificationsRead(activeWorkspace.id);
  };

  const deleteNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const clearAll = () => {
    setNotifications([]);
  };

  const sendTestNotification = () => {
    NotificationService.scheduleLocalNotification(
      "Test Notification",
      "This is a sample notification to verify the system is working!",
    );
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        loading,
        refresh,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        clearAll,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error(
      "useNotifications must be used within a NotificationProvider",
    );
  }
  return context;
};
