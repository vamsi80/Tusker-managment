import { useEffect, useState } from "react";
import { View } from "react-native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { Bell, MessagesSquare } from "lucide-react-native";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { Tabs } from "../../components/ui";
import { Screen, ScreenHeader } from "../../components/layout/Screen";
import { NotificationsScreen } from "../notifications/NotificationsScreen";
import { MessagesScreen } from "../messages/MessagesScreen";
import type { MainTabParamList } from "../../navigation/types";

type Tab = "notifications" | "messages";

/** Notifications and direct messages in one tab, like ClickUp's and Slack's inbox. */
export function InboxScreen({ route }: BottomTabScreenProps<MainTabParamList, "Inbox">) {
    const { layout } = useWorkspace();
    const [tab, setTab] = useState<Tab>(route.params?.tab ?? "notifications");
    useEffect(() => {
        if (route.params?.tab) setTab(route.params.tab);
    }, [route.params?.tab]);
    const unread = layout?.unreadNotificationsCount ?? 0;

    return (
        <Screen>
            <ScreenHeader title="Inbox" />
            <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 2 }}>
                <Tabs<Tab>
                    value={tab}
                    onChange={setTab}
                    scrollable={false}
                    items={[
                        { key: "notifications", label: "Notifications", icon: Bell, count: unread || undefined },
                        { key: "messages", label: "Messages", icon: MessagesSquare },
                    ]}
                />
            </View>
            {tab === "notifications" ? <NotificationsScreen embedded /> : <MessagesScreen embedded />}
        </Screen>
    );
}
