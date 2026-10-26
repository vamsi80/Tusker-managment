import { useState, type ComponentType } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import Constants from "expo-constants";
import {
    Building2,
    CalendarCheck,
    CalendarDays,
    ChevronRight,
    ChevronsUpDown,
    CircleCheckBig,
    KeyRound,
    ListTodo,
    LogOut,
    Moon,
    Settings,
    Sparkles,
    Trophy,
    Truck,
    Users,
    Palmtree,
    Store,
} from "lucide-react-native";
import { useAuth } from "../../providers/AuthProvider";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { displayName } from "../../lib/format";
import { useTheme, type ThemePreference } from "../../theme/ThemeProvider";
import { fonts, radius } from "../../theme/tokens";
import { Avatar, Badge, GroupedRow, Section, Tabs, Text, confirm } from "../../components/ui";
import { Screen, ScreenBody, ScreenHeader } from "../../components/layout/Screen";
import { WorkspaceLogo, WorkspaceSwitcherSheet } from "../../components/layout/WorkspaceSwitcher";
import { SmileArc } from "../../components/brand/Drava";

type IconType = ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

/**
 * Everything that isn't a tab: you, your workspace, every module as a grid,
 * then workspace settings, appearance and account.
 */
export function MoreScreen() {
    const { colors, preference, setPreference } = useTheme();
    const navigation = useNavigation<any>();
    const auth = useAuth();
    const { workspace, permissions, can, isAdmin } = useWorkspace();
    const [switcher, setSwitcher] = useState(false);
    const user = auth.status === "signedIn" ? auth.user : null;
    const role = permissions?.workspaceRole;
    const go = (route: string, params?: object) => navigation.navigate(route, params);

    const modules: { label: string; icon: IconType; show?: boolean; onPress: () => void }[] = [
        { label: "Tasks", icon: CircleCheckBig, onPress: () => go("Tasks") },
        { label: "Calendar", icon: CalendarDays, onPress: () => go("Calendar") },
        { label: "My Space", icon: ListTodo, onPress: () => go("MySpace") },
        { label: "Team", icon: Users, onPress: () => go("Team") },
        { label: "Attendance", icon: CalendarCheck, onPress: () => go("Team", { tab: "attendance" }) },
        { label: "Leaves", icon: Palmtree, onPress: () => go("Team", { tab: "leaves" }) },
        { label: "Points", icon: Trophy, onPress: () => go("Team", { tab: "points" }) },
        { label: "Procurement", icon: Truck, show: can("procurement:view"), onPress: () => go("Procurement") },
        { label: "Suppliers", icon: Store, show: can("vendors:view"), onPress: () => go("Vendors") },
    ];

    return (
        <Screen>
            <ScreenHeader title="More" />
            <ScreenBody contentStyle={{ gap: 14 }}>
                <Pressable onPress={() => go("Profile")} style={({ pressed }) => [styles.profile, { backgroundColor: colors.hero, transform: [{ scale: pressed ? 0.985 : 1 }] }]}>
                    <SmileArc size={160} opacity={0.35} style={{ right: -60, top: -50 }} />
                    <Avatar name={displayName(user)} image={user?.image} size={54} />
                    <View style={{ flex: 1, gap: 3 }}>
                        <Text style={{ fontFamily: fonts.heading, fontSize: 17, color: colors.heroForeground }} numberOfLines={1}>
                            {displayName(user, "You")}
                        </Text>
                        <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.heroMuted }} numberOfLines={1}>
                            {user?.email}
                        </Text>
                    </View>
                    <ChevronRight size={20} color={colors.heroMuted} />
                </Pressable>

                <Pressable onPress={() => setSwitcher(true)} style={({ pressed }) => [styles.workspace, { backgroundColor: pressed ? colors.secondary : colors.card, borderColor: colors.border }]}>
                    <WorkspaceLogo name={workspace?.name} size={42} />
                    <View style={{ flex: 1 }}>
                        <Text variant="small" tone="muted">
                            Workspace
                        </Text>
                        <Text variant="title" numberOfLines={1}>
                            {workspace?.name ?? "Workspace"}
                        </Text>
                    </View>
                    {role ? <Badge label={role.charAt(0) + role.slice(1).toLowerCase()} color={colors.success} /> : null}
                    <ChevronsUpDown size={18} color={colors.mutedForeground} />
                </Pressable>

                <Text variant="overline" tone="muted" style={{ marginTop: 8, paddingHorizontal: 4 }}>
                    Modules
                </Text>
                <View style={styles.grid}>
                    {modules
                        .filter((m) => m.show !== false)
                        .map((m) => {
                            const Icon = m.icon;
                            return (
                                <Pressable
                                    key={m.label}
                                    onPress={m.onPress}
                                    style={({ pressed }) => [styles.module, { backgroundColor: pressed ? colors.secondary : colors.card, borderColor: colors.border, transform: [{ scale: pressed ? 0.96 : 1 }] }]}
                                >
                                    <Icon size={22} color={colors.primaryInk} strokeWidth={1.9} />
                                    <Text style={{ fontFamily: fonts.medium, fontSize: 13, color: colors.foreground }} numberOfLines={1}>
                                        {m.label}
                                    </Text>
                                </Pressable>
                            );
                        })}
                </View>

                <View style={{ height: 8 }} />
                <Section title="Workspace">
                    <GroupedRow icon={Settings} label="Settings" onPress={() => go("Settings")} />
                    <GroupedRow icon={Building2} label="Workspace information" onPress={() => go("WorkspaceInfo")} />
                    <GroupedRow icon={Sparkles} label="Ask Travis" description="Your AI workspace assistant" onPress={() => go("Travis")} />
                </Section>

                <View style={{ height: 8 }} />
                <Section title="Appearance">
                    <View style={{ padding: 14, gap: 12 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                            <View style={[styles.tile, { backgroundColor: colors.iconTile }]}>
                                <Moon size={18} color={colors.iconTileFg} />
                            </View>
                            <Text style={{ fontFamily: fonts.medium, fontSize: 15, color: colors.foreground }}>Theme</Text>
                        </View>
                        <Tabs<ThemePreference>
                            value={preference}
                            onChange={setPreference}
                            scrollable={false}
                            compact
                            items={[
                                { key: "light", label: "Light" },
                                { key: "dark", label: "Dark" },
                                { key: "system", label: "System" },
                            ]}
                        />
                    </View>
                </Section>

                <View style={{ height: 8 }} />
                <Section title="Account">
                    <GroupedRow icon={KeyRound} label="Change password" onPress={() => go("ChangePassword")} />
                    <GroupedRow
                        icon={LogOut}
                        label="Log out"
                        destructive
                        onPress={async () => {
                            if (await confirm({ title: "Log out of drava core?", confirmLabel: "Log out", destructive: true })) auth.signOut();
                        }}
                    />
                </Section>

                <Text variant="caption" tone="muted" center style={{ paddingVertical: 8 }}>
                    drava core {Constants.expoConfig?.version ?? ""}
                    {isAdmin ? " · Admin" : ""}
                </Text>
            </ScreenBody>
            <WorkspaceSwitcherSheet open={switcher} onClose={() => setSwitcher(false)} />
        </Screen>
    );
}

const styles = StyleSheet.create({
    profile: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: radius.lg, borderBottomRightRadius: radius.smile, overflow: "hidden" },
    workspace: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: radius.lg, borderWidth: 1 },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    module: { width: "31.8%", gap: 12, padding: 14, borderRadius: 18, borderWidth: 1 },
    tile: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center" },
});
