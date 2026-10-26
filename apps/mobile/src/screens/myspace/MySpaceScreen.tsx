import { useEffect, useState, type ComponentType } from "react";
import { StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { Calendar, ListTodo, Mail, MessagesSquare, Shield, User as UserIcon } from "lucide-react-native";
import { userApi } from "../../api/comms";
import { useAuth } from "../../providers/AuthProvider";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { qk } from "../../lib/query";
import { displayName, fmtDate } from "../../lib/format";
import { useTheme } from "../../theme/ThemeProvider";
import { radius } from "../../theme/tokens";
import { Avatar, Skeleton, Tabs, Text, tint } from "../../components/ui";
import { Screen, ScreenBody, ScreenHeader } from "../../components/layout/Screen";
import { TodoList } from "../../components/myspace/TodoList";
import type { RootStackParamList } from "../../navigation/types";

type Tab = "info" | "todo";

/** /w/[workspaceId]/myspace — myspace-nav.tsx: My Info, To-Do, Chat. */
export function MySpaceScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, "MySpace">) {
    const { workspaceId } = useWorkspace();
    const [tab, setTab] = useState<Tab>(route.params?.tab ?? "info");
    useEffect(() => {
        if (route.params?.tab) setTab(route.params.tab);
    }, [route.params?.tab]);

    return (
        <Screen>
            <ScreenHeader title="My Space" />
            <ScreenBody>
                <Tabs<Tab | "chat">
                    value={tab}
                    scrollable={false}
                    onChange={(key) => (key === "chat" ? navigation.navigate("Main", { screen: "Inbox", params: { tab: "messages" } }) : setTab(key))}
                    items={[
                        { key: "info", label: "My Info", icon: UserIcon },
                        { key: "todo", label: "To-Do", icon: ListTodo },
                        { key: "chat", label: "Chat", icon: MessagesSquare },
                    ]}
                />
                {tab === "info" ? <MyInfo /> : <TodoList workspaceId={workspaceId} />}
            </ScreenBody>
        </Screen>
    );
}

/** myspace/page.tsx — avatar, name and four facts. */
function MyInfo() {
    const { colors, shadow } = useTheme();
    const auth = useAuth();
    const { role, isLoading } = useWorkspace();
    const profile = useQuery({ queryKey: qk.profile(), queryFn: () => userApi.profile() });
    const user = { ...(auth.status === "signedIn" ? auth.user : {}), ...(profile.data?.user ?? {}) } as any;

    if (isLoading || (!user.id && profile.isLoading)) {
        return (
            <View style={{ gap: 12 }}>
                <Skeleton height={120} rounded={24} />
                <Skeleton height={72} rounded={16} />
                <Skeleton height={72} rounded={16} />
            </View>
        );
    }

    return (
        <View style={{ gap: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 18, paddingVertical: 8 }}>
                <View style={[{ borderRadius: 48, borderWidth: 4, borderColor: colors.background, backgroundColor: colors.background }, shadow.lg]}>
                    <Avatar name={displayName(user)} image={user.image} size={88} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="h1" numberOfLines={2}>
                        {displayName(user)}
                    </Text>
                    <Text variant="bodyMedium" tone="muted" numberOfLines={1}>
                        {user.email}
                    </Text>
                </View>
            </View>
            <View style={{ gap: 10 }}>
                <Fact icon={Mail} color={colors.primaryInk} label="Email" value={user.email} />
                <Fact icon={Shield} color={colors.info} label="Workspace Role" value={role ? role.charAt(0) + role.slice(1).toLowerCase() : "Member"} valueColor={colors.info} />
                <Fact icon={Calendar} color={colors.success} label="Joined" value={user.createdAt ? fmtDate(user.createdAt, "MMM d, yyyy") : "—"} />
                <Fact icon={UserIcon} color={colors.leave} label="ID" value={user.id} mono />
            </View>
        </View>
    );
}

function Fact({
    icon: Icon,
    color,
    label,
    value,
    valueColor,
    mono,
}: {
    icon: ComponentType<{ size?: number; color?: string }>;
    color: string;
    label: string;
    value?: string;
    valueColor?: string;
    mono?: boolean;
}) {
    const { colors } = useTheme();
    return (
        <View style={[styles.fact, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.factIcon, { backgroundColor: tint(color, 0.12) }]}>
                <Icon size={20} color={color} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
                <Text variant="overline" tone="muted">
                    {label}
                </Text>
                <Text variant={mono ? "mono" : "label"} numberOfLines={1} style={[{ fontSize: 14 }, valueColor ? { color: valueColor } : null]}>
                    {value || "—"}
                </Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    fact: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: radius.lg, borderWidth: 1 },
    factIcon: { padding: 9, borderRadius: 10 },
});
