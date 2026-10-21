import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";

// Configure how notifications are handled when the app is in the foreground
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
    }),
});

/** Push category for direct messages; the server sets it on DM pushes (audit.ts). */
export const DM_CATEGORY = "direct_message";
export const DM_ACTION_REPLY = "reply";
export const DM_ACTION_MARK_READ = "mark_read";

export class NotificationService {
    /**
     * Direct messages behave like a chat app's: their own "Messages" channel
     * that pops up on screen, and Reply / Mark as read buttons (handled in
     * NotificationContext's response handler).
     *
     * Reply opens the app: Expo doesn't deliver a background action to an app
     * that was fully closed, and losing someone's typed reply is worse than the
     * app opening. Mark as read stays in the background; if it's ever dropped,
     * the chat just stays unread.
     */
    static async registerMessageNotifications() {
        if (Platform.OS === "android") {
            await Notifications.setNotificationChannelAsync("messages", {
                name: "Messages",
                description: "Direct messages from your team",
                importance: Notifications.AndroidImportance.MAX,
                vibrationPattern: [0, 250, 250, 250],
                lightColor: "#FF231F7C",
                lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
            });
        }
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
