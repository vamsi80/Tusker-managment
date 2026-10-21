import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";

/** Silent push the server sends when a chat is read anywhere (web or app). */
export const DM_READ_TYPE = "dm_read";

// Configure how notifications are handled when the app is in the foreground.
// The silent "read" push has nothing to show.
Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
        const show = (notification.request.content.data as any)?.type !== DM_READ_TYPE;
        return {
            shouldPlaySound: show,
            shouldSetBadge: show,
            shouldShowBanner: show,
            shouldShowList: show,
        };
    },
});

/** Push category for direct messages; the server sets it on DM pushes (conversation.service). */
export const DM_CATEGORY = "direct_message";
export const DM_ACTION_REPLY = "reply";
export const DM_ACTION_MARK_READ = "mark_read";

/**
 * Removes a chat's message notifications from the tray: the chat was read
 * somewhere (WhatsApp Web style), so they're stale.
 */
export async function dismissConversationNotifications(conversationId: string) {
    const shown = await Notifications.getPresentedNotificationsAsync();
    await Promise.all(
        shown
            .filter((n) => (n.request.content.data as any)?.conversationId === conversationId)
            .map((n) => Notifications.dismissNotificationAsync(n.request.identifier)),
    );
}

/** The data of a background push; its shape differs by platform and app state. */
function pushData(payload: any): Record<string, any> | null {
    const raw = payload?.data ?? payload?.notification?.data ?? payload;
    if (!raw) return null;
    if (typeof raw.dataString === "string") {
        try {
            return JSON.parse(raw.dataString);
        } catch {
            return null;
        }
    }
    // iOS carries Expo's data under `body`.
    return raw.body && typeof raw.body === "object" ? raw.body : raw;
}

// Runs for pushes that arrive while the app is in the background or closed.
// Defined at module load (index.js -> App -> NotificationContext imports this),
// which is when Android's headless task looks it up.
export const BACKGROUND_PUSH_TASK = "tusker-background-push";
TaskManager.defineTask(BACKGROUND_PUSH_TASK, async ({ data, error }) => {
    if (error) return;
    const push = pushData(data);
    if (push?.type === DM_READ_TYPE && typeof push.conversationId === "string") {
        await dismissConversationNotifications(push.conversationId);
    }
});

export class NotificationService {
    /**
     * Direct messages behave like a chat app's: they pop up on screen (the
     * "default" channel is max importance) and carry Reply / Mark as read
     * buttons (handled in NotificationContext's response handler). No separate
     * channel: a push naming a channel an older install lacks is never shown.
     *
     * Reply opens the app: Expo doesn't deliver a background action to an app
     * that was fully closed, and losing someone's typed reply is worse than the
     * app opening. Mark as read stays in the background; if it's ever dropped,
     * the chat just stays unread.
     */
    static async registerMessageNotifications() {
        await Notifications.setNotificationCategoryAsync(DM_CATEGORY, [
            {
                identifier: DM_ACTION_REPLY,
                buttonTitle: "Reply",
                textInput: { submitButtonTitle: "Send", placeholder: "Message" },
                options: { opensAppToForeground: true },
            },
            {
                identifier: DM_ACTION_MARK_READ,
                buttonTitle: "Mark as read",
                options: { opensAppToForeground: false },
            },
        ]);
        // Lets the silent "read" push clear notifications with the app closed.
        if (!(await TaskManager.isTaskRegisteredAsync(BACKGROUND_PUSH_TASK))) {
            await Notifications.registerTaskAsync(BACKGROUND_PUSH_TASK);
        }
    }

    /**
     * Request permissions and get the Expo push token
     */
    static async registerForPushNotificationsAsync() {
        let token;

        try {
            if (Platform.OS === "android") {
                await Notifications.setNotificationChannelAsync("default", {
                    name: "default",
                    importance: Notifications.AndroidImportance.MAX,
                    vibrationPattern: [0, 250, 250, 250],
                    lightColor: "#FF231F7C",
                });
            }
            await NotificationService.registerMessageNotifications();

            if (Device.isDevice) {
                const { status: existingStatus } = await Notifications.getPermissionsAsync();
                let finalStatus = existingStatus;
                if (existingStatus !== "granted") {
                    const { status } = await Notifications.requestPermissionsAsync();
                    finalStatus = status;
                }
                if (finalStatus !== "granted") {
                    console.warn("Failed to get push token for push notification!");
                    return;
                }

                // projectId is required for Expo Push Tokens since SDK 49+
                const projectId = 
                    Constants?.expoConfig?.extra?.eas?.projectId ?? 
                    Constants?.easConfig?.projectId ??
                    (Constants?.expoConfig as any)?.projectId;

                console.log("[NotificationService] Using projectId:", projectId);

                if (!projectId) {
                    console.warn("[NotificationService] No EAS projectId found. Push tokens (remote) are disabled.");
                    return; 
                }

                const expoToken = await Notifications.getExpoPushTokenAsync({
                    projectId
                });
                token = expoToken.data;
                console.log("[NotificationService] Generated Expo Push Token:", token);
            } else {
                console.log("[NotificationService] Must use physical device for Push Notifications");
            }
        } catch (error) {
            console.error("Error registering for notifications:", error);
        }

        return token;
    }

    /**
     * Schedule a local notification
     */
    static async scheduleLocalNotification(title: string, body: string, data: any = {}) {
        await Notifications.scheduleNotificationAsync({
            content: {
                title,
                body,
                data,
                sound: "default",
            },
            trigger: null, // send immediately
        });
    }

    /**
     * Schedule a notification for a specific time or interval
     */
    static async scheduleDelayedNotification(title: string, body: string, seconds: number) {
        await Notifications.scheduleNotificationAsync({
            content: {
                title,
                body,
                sound: "default",
            },
            trigger: {
                seconds: seconds,
                type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            },
        });
    }
}
