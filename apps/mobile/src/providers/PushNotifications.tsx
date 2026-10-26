import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import type * as NotificationsModule from "expo-notifications";
import * as Device from "expo-device";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { useQueryClient } from "@tanstack/react-query";
import { userApi } from "../api/comms";
import { useAuth } from "./AuthProvider";
import { useWorkspace } from "./WorkspaceProvider";
import { navigationRef } from "../navigation/linking";
import { qk } from "../lib/query";

// Expo Go dropped remote push on Android (SDK 53+) and logs an error as soon as
// expo-notifications loads, so the module is only loaded in real builds.
const Notifications: typeof NotificationsModule | null =
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient ? null : require("expo-notifications");

// Foreground pushes go to the notification list; the in-app realtime toast
// already covers what's on screen.
Notifications?.setNotificationHandler({
    handleNotification: async () => ({ shouldPlaySound: false, shouldSetBadge: true, shouldShowBanner: false, shouldShowList: true }),
});

async function expoPushToken(Notifications: typeof NotificationsModule): Promise<string | null> {
    if (!Device.isDevice) return null;
    if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("default", {
            name: "default",
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
        });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== "granted") return null;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return null;
    return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
}

/**
 * Registers this device with the backend's existing Expo push pipeline
 * (POST /user/push-token) and routes notification taps to the right screen,
 * using the payload fields packages/core/src/lib/notifications.ts and audit.ts send.
 */
export function PushNotifications() {
    return Notifications ? <PushRegistration Notifications={Notifications} /> : null;
}

function PushRegistration({ Notifications }: { Notifications: typeof NotificationsModule }) {
    const auth = useAuth();
    const { workspaceId } = useWorkspace();
    const qc = useQueryClient();
    const registered = useRef<string | null>(null);

    useEffect(() => {
        if (auth.status !== "signedIn" || !auth.user.id || registered.current === auth.user.id) return;
        registered.current = auth.user.id;
        expoPushToken(Notifications)
            .then((token) => token && userApi.registerPushToken(token))
            .catch(() => (registered.current = null));
    }, [Notifications, auth]);

    useEffect(() => {
        const open = (response: NotificationsModule.NotificationResponse) => {
            const data: any = response.notification.request.content.data ?? {};
            if (!navigationRef.isReady()) return;
            qc.invalidateQueries({ queryKey: qk.notifications(workspaceId) });
            const entityType = String(data.entityType ?? "").toUpperCase();
            if (data.conversationId) navigationRef.navigate("Chat", { conversationId: data.conversationId, name: data.senderName });
            else if ((entityType === "TASK" || entityType === "SUBTASK") && data.entityId) navigationRef.navigate("TaskDetail", { taskId: data.entityId });
            else if (entityType === "INDENT" && data.entityId) navigationRef.navigate("IndentDetail", { indentId: data.entityId });
            else navigationRef.navigate("Main", { screen: "Inbox", params: { tab: "notifications" } });
        };
        const sub = Notifications.addNotificationResponseReceivedListener(open);
        Notifications.getLastNotificationResponseAsync().then((r) => {
            if (r) {
                setTimeout(() => open(r), 600);
                Notifications.clearLastNotificationResponseAsync().catch(() => {});
            }
        });
        return () => sub.remove();
    }, [Notifications, qc, workspaceId]);

    return null;
}
