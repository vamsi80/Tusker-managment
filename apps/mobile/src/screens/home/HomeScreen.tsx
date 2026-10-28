import { useState, type ComponentType, type ReactNode } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Bell, CalendarDays, ChevronDown, CircleCheckBig, ChevronRight, ListTodo, Megaphone, Palmtree, Sparkles, Truck, Users } from "lucide-react-native";
import { useAuth } from "../../providers/AuthProvider";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { displayName } from "../../lib/format";
import { useTheme } from "../../theme/ThemeProvider";
import { fonts, radius } from "../../theme/tokens";
import { Avatar, Sheet, Text, tint } from "../../components/ui";
import { WorkspaceLogo, WorkspaceSwitcherSheet, useIsSystemAccount } from "../../components/layout/WorkspaceSwitcher";
import { Ionicons } from "@expo/vector-icons";
import { AttendanceHeroCard } from "../../components/attendance/AttendanceHeroCard";
import { TeamRosterCard } from "../../components/attendance/TeamRosterCard";
import { BroadcastTicker, BroadcastWidget } from "../dashboard/widgets/BroadcastWidget";
import { MyTasksWidget, ReviewsWidget, WorkloadWidget } from "../dashboard/widgets/TaskWidgets";
import { BirthdaysWidget, MeetingsWidget } from "../dashboard/widgets/PeopleWidgets";

type IconType = ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

const greeting = () => {
    const h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

/** The workspace dashboard as an app home: who/where you are, today's attendance, shortcuts, then your work. */
export function HomeScreen() {
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();
    const navigation = useNavigation<any>();
    const qc = useQueryClient();
    const auth = useAuth();
    const { workspace, permissions, workspaceId, refetchLayout, layout, can, isAdmin } = useWorkspace();
    const [refreshing, setRefreshing] = useState(false);
    const [switcher, setSwitcher] = useState(false);
    const isSystem = useIsSystemAccount();
    const user = auth.status === "signedIn" ? auth.user : null;

    const canBroadcast = !!permissions?.isWorkspaceAdmin;
    const canSeeWorkload = canBroadcast || permissions?.workspaceRole === "MANAGER";

    const refresh = async () => {
        setRefreshing(true);
        refetchLayout();
        await qc.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey.includes(workspaceId) });
        setRefreshing(false);
    };

    // drava: one neutral tile style; the glyph carries the single lime accent.
    const shortcuts: { label: string; icon: IconType; show?: boolean; onPress: () => void }[] = [
        { label: "Tasks", icon: CircleCheckBig, onPress: () => navigation.navigate("Tasks") },
        { label: "Calendar", icon: CalendarDays, onPress: () => navigation.navigate("Calendar") },
        { label: "Team", icon: Users, onPress: () => navigation.navigate("Team") },
        { label: "Leaves", icon: Palmtree, onPress: () => navigation.navigate("Team", { tab: "leaves" }) },
        { label: "To-do", icon: ListTodo, onPress: () => navigation.navigate("MySpace", { tab: "todo" }) },
        { label: "Procure", icon: Truck, show: can("procurement:view"), onPress: () => navigation.navigate("Procurement") },
    ];
    const projects = layout?.projects ?? [];

    return (
        <View style={{ flex: 1, backgroundColor: colors.background }}>
            <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
                {/* Row 1: workspace switcher chip (switching is system account only), then Travis / bell / you. */}
                <View style={styles.headerRow}>
                    <Pressable
                        disabled={!isSystem}
                        onPress={() => setSwitcher(true)}
                        hitSlop={6}
                        accessibilityLabel={isSystem ? "Switch workspace" : undefined}
                        style={({ pressed }) => [styles.wsChip, { backgroundColor: pressed ? colors.secondary : colors.card, borderColor: colors.border }]}
                    >
                        <WorkspaceLogo name={workspace?.name} size={32} />
                        <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.foreground, flexShrink: 1 }} numberOfLines={1}>
                            {workspace?.name ?? "Workspace"}
                        </Text>
                        {isSystem ? <ChevronDown size={16} color={colors.mutedForeground} /> : null}
                    </Pressable>
                    <View style={{ flex: 1 }} />
                    <RoundBtn label="Ask Travis" onPress={() => navigation.navigate("Travis")}>
                        <Sparkles size={20} color={colors.foreground} strokeWidth={1.9} />
                    </RoundBtn>
                    <RoundBtn label="Notifications" badge={layout?.unreadNotificationsCount ?? 0} onPress={() => navigation.navigate("Main", { screen: "Inbox", params: { tab: "notifications" } })}>
                        <Bell size={20} color={colors.foreground} strokeWidth={1.9} />
                    </RoundBtn>
                    <Pressable onPress={() => navigation.navigate("Profile")} hitSlop={6} accessibilityLabel="Profile">
                        <Avatar name={displayName(user)} image={user?.image} size={44} />
                    </Pressable>
                </View>
                {/* Row 2: the greeting. */}
                <View style={{ marginTop: 20 }}>
                    <Text style={{ fontFamily: fonts.body, fontSize: 15, color: colors.mutedForeground }}>{greeting()},</Text>
                    <Text style={{ fontFamily: fonts.heading, fontSize: 28, lineHeight: 34, letterSpacing: -0.6, color: colors.foreground, marginTop: 2 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                        {displayName(user, "there")}
                    </Text>
                </View>
            </View>

            <ScrollView
                contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 10, gap: 22, paddingBottom: 32 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primaryInk} colors={[colors.primary]} />}
            >
                <BroadcastTicker />
                {/* Owners, admins and the system account get the team roster in place of their own check-in card. */}
                {isAdmin || isSystem ? <TeamRosterCard /> : <AttendanceHeroCard />}

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }} style={{ marginHorizontal: -20 }}>
                    <View style={{ width: 10 }} />
                    {shortcuts
                        .filter((s) => s.show !== false)
                        .map((s) => {
                            const Icon = s.icon;
                            return (
                                <Pressable
                                    key={s.label}
                                    onPress={s.onPress}
                                    style={({ pressed }) => [styles.shortcut, { backgroundColor: pressed ? colors.secondary : colors.card, borderColor: colors.border, transform: [{ scale: pressed ? 0.95 : 1 }] }]}
                                >
                                    <Icon size={22} color={colors.primaryInk} strokeWidth={1.9} />
                                    <Text style={{ fontFamily: fonts.medium, fontSize: 12, color: colors.foreground }} numberOfLines={1}>
                                        {s.label}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    <View style={{ width: 10 }} />
                </ScrollView>

                {projects.length ? (
                    <View style={{ gap: 12 }}>
                        <SectionHeader title="Projects" action="See all" onAction={() => navigation.navigate("Main", { screen: "Projects" })} />
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }} style={{ marginHorizontal: -20 }}>
                            <View style={{ width: 8 }} />
                            {projects.slice(0, 10).map((p: any) => (
                                <Pressable
                                    key={p.id}
                                    onPress={() => navigation.navigate("Project", { projectId: p.id, name: p.name })}
                                    style={({ pressed }) => [styles.projectCard, { backgroundColor: colors.card, borderColor: colors.border, transform: [{ scale: pressed ? 0.97 : 1 }] }]}
                                >
                                    {/* Outline folder in the project colour + arrow, the same mark as the Projects tab rows. */}
                                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                                        <Ionicons name="folder-outline" size={26} color={p.color || colors.foreground} />
                                        <View style={{ flex: 1 }} />
                                        <View style={[styles.projectArrow, { backgroundColor: colors.raised }]}>
                                            <ArrowUpRight size={15} color={colors.foreground} />
                                        </View>
                                    </View>
                                    <View style={{ gap: 3 }}>
                                        <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: colors.foreground }} numberOfLines={1}>
                                            {p.name}
                                        </Text>
                                        <Text style={{ fontFamily: fonts.body, fontSize: 12, color: colors.mutedForeground }} numberOfLines={1}>
                                            {p.description || "No description provided"}
                                        </Text>
                                    </View>
                                </Pressable>
                            ))}
                            <View style={{ width: 8 }} />
                        </ScrollView>
                    </View>
                ) : null}

                {canBroadcast ? <AnnounceRow /> : null}
                <MyTasksWidget />
                <MeetingsWidget />
                <ReviewsWidget />
                {canSeeWorkload ? <WorkloadWidget /> : null}
                <BirthdaysWidget />
            </ScrollView>
            {isSystem ? <WorkspaceSwitcherSheet open={switcher} onClose={() => setSwitcher(false)} /> : null}
        </View>
    );
}

function RoundBtn({ label, badge, onPress, children }: { label: string; badge?: number; onPress: () => void; children: ReactNode }) {
    const { colors } = useTheme();
    return (
        <Pressable
            accessibilityLabel={label}
            hitSlop={6}
            onPress={onPress}
            style={({ pressed }) => [styles.roundBtn, { backgroundColor: pressed ? colors.secondary : colors.card, borderColor: colors.border, transform: [{ scale: pressed ? 0.94 : 1 }] }]}
        >
            {children}
            {badge ? (
                <View style={[styles.badge, { backgroundColor: colors.badgeBg, borderColor: colors.background }]}>
                    <Text style={{ fontFamily: fonts.bold, fontSize: 10, lineHeight: 12, includeFontPadding: false, textAlignVertical: "center", color: colors.badgeFg }}>{badge > 99 ? "99+" : badge}</Text>
                </View>
            ) : null}
        </Pressable>
    );
}

/** Admins post from a sheet; the ticker above already shows what's live. */
function AnnounceRow() {
    const { colors } = useTheme();
    const [open, setOpen] = useState(false);
    return (
        <>
            <Pressable onPress={() => setOpen(true)} style={({ pressed }) => [styles.announce, { backgroundColor: pressed ? colors.secondary : colors.card, borderColor: colors.border }]}>
                <View style={[styles.announceIcon, { backgroundColor: tint(colors.broadcast, 0.14) }]}>
                    <Megaphone size={19} color={colors.broadcast} />
                </View>
                <View style={{ flex: 1 }}>
                    <Text variant="title">Post an announcement</Text>
                    <Text variant="small" tone="muted">
                        Broadcast to the whole workspace or a department
                    </Text>
                </View>
                <ChevronRight size={18} color={colors.mutedForeground} />
            </Pressable>
            <Sheet open={open} onClose={() => setOpen(false)} title="Announcements">
                <BroadcastWidget />
            </Sheet>
        </>
    );
}

function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
    const { colors } = useTheme();
    return (
        <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={{ flex: 1, fontFamily: fonts.heading, fontSize: 16, lineHeight: 22, color: colors.foreground }}>{title}</Text>
            {action ? (
                <Pressable onPress={onAction} hitSlop={8} style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text variant="label" tone="primary" style={{ fontSize: 13 }}>
                        {action}
                    </Text>
                    <ChevronRight size={15} color={colors.primaryInk} />
                </Pressable>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    header: { paddingHorizontal: 20, paddingBottom: 12 },
    shortcut: { width: 84, alignItems: "center", gap: 8, paddingTop: 15, paddingBottom: 12, borderRadius: 18, borderWidth: 1 },
    projectCard: {
        width: 210,
        padding: 16,
        gap: 14,
        borderRadius: radius.lg,
        // Flat with a hairline border: the horizontal scroller clips a shadow's bottom edge.
        borderWidth: 1,
    },
    projectArrow: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
    headerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    wsChip: { flexDirection: "row", alignItems: "center", gap: 9, maxWidth: "50%", paddingLeft: 6, paddingRight: 12, height: 44, borderRadius: radius.md, borderWidth: 1 },
    roundBtn: { width: 44, height: 44, borderRadius: radius.md, borderWidth: 1, alignItems: "center", justifyContent: "center" },
    // Unread count: big enough to read at a glance, digits centred (no Android font padding).
    badge: { position: "absolute", top: -6, right: -6, minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 4, borderWidth: 2, alignItems: "center", justifyContent: "center" },
    announce: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: radius.lg, borderWidth: 1 },
    announceIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
});
