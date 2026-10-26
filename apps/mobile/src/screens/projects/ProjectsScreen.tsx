import { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { FolderOpen } from "lucide-react-native";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { useTheme } from "../../theme/ThemeProvider";
import { fonts, radius } from "../../theme/tokens";
import { ActionMenu, EmptyState, Text } from "../../components/ui";
import { ProjectActionsMenu } from "../../components/project/ProjectActionsMenu";

/** The old app's short chip labels (apps/mobile constants/projectCategory.ts). */
const CATEGORIES = [
    { value: "WHITE_TUSKER", label: "TWT" },
    { value: "LATTICE_LANE", label: "PL/LL" },
    { value: "MISCELLANEOUS", label: "Others" },
];

/** Dark ink on the amber chip; white fails contrast on #fbb54a. */

/**
 * apps/mobile ProjectsScreen.tsx: large title with round search / bell / more
 * buttons, category chips, then pill-shaped rows — a folder in the project's
 * colour, name and description, manager initials and an arrow.
 * Long-press (or a manager's More) opens the project actions.
 */
export function ProjectsScreen() {
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();
    const navigation = useNavigation<any>();
    const { layout, permissions, isAdmin, refetchLayout } = useWorkspace();
    const [searchOpen, setSearchOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [category, setCategory] = useState<string | null>(null);
    const [projectMenu, setProjectMenu] = useState<any | null>(null);
    const [moreOpen, setMoreOpen] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const canCreate = permissions?.canCreateProject ?? isAdmin;
    const unread = layout?.unreadNotificationsCount ?? 0;
    const soft = colors.card;

    const projects = useMemo(
        () =>
            (layout?.projects ?? []).filter((p: any) => {
                if (category && p.category !== category) return false;
                return !search.trim() || p.name?.toLowerCase().includes(search.trim().toLowerCase());
            }),
        [layout?.projects, category, search],
    );

    const managersOf = (p: any): { id: string; surname: string | null }[] =>
        layout?.projectManagers?.[p.id] ?? (p.projectManager ? [p.projectManager] : []);

    return (
        <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
            <View style={styles.header}>
                <Text style={[styles.title, { color: colors.foreground }]}>Projects</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                    <HeaderBtn
                        icon={searchOpen ? "close" : "search"}
                        label={searchOpen ? "Close search" : "Search projects"}
                        bg={soft}
                        onPress={() => {
                            if (searchOpen) setSearch("");
                            setSearchOpen((v) => !v);
                        }}
                    />
                    <HeaderBtn icon="notifications-outline" label="Notifications" bg={soft} badge={unread} onPress={() => navigation.navigate("Main", { screen: "Inbox", params: { tab: "notifications" } })} />
                    <HeaderBtn icon="ellipsis-horizontal" label="More options" bg={soft} onPress={() => setMoreOpen(true)} />
                </View>
            </View>

            {searchOpen ? (
                <View style={[styles.search, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Ionicons name="search" size={20} color={colors.mutedForeground} />
                    <TextInput
                        autoFocus
                        value={search}
                        onChangeText={setSearch}
                        placeholder="Search projects..."
                        placeholderTextColor={colors.mutedForeground}
                        style={{ flex: 1, marginLeft: 8, fontFamily: fonts.medium, fontSize: 16, color: colors.foreground }}
                        selectionColor={colors.primary}
                    />
                </View>
            ) : null}

            <View style={styles.chips}>
                {CATEGORIES.map((c) => {
                    const active = category === c.value;
                    return (
                        <Pressable
                            key={c.value}
                            onPress={() => {
                                Haptics.selectionAsync().catch(() => {});
                                setCategory(active ? null : c.value);
                            }}
                            style={[styles.chip, { borderColor: active ? colors.foreground : colors.border, backgroundColor: active ? colors.foreground : colors.card }]}
                        >
                            <Text style={{ fontFamily: active ? fonts.semibold : fonts.medium, fontSize: 13, color: active ? colors.background : colors.foreground }}>{c.label}</Text>
                        </Pressable>
                    );
                })}
            </View>

            <FlatList
                data={projects}
                keyExtractor={(p: any) => p.id}
                contentContainerStyle={[styles.list, projects.length === 0 ? { flexGrow: 1 } : null]}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={async () => {
                            setRefreshing(true);
                            await refetchLayout();
                            setRefreshing(false);
                        }}
                        tintColor={colors.primaryInk}
                    />
                }
                ListEmptyComponent={
                    <EmptyState
                        icon={FolderOpen}
                        title={search ? "No matching projects" : "No projects yet"}
                        description={search ? "Try a different search term." : canCreate ? "Create your first project to get started." : undefined}
                        actionLabel={!search && canCreate ? "Create project" : undefined}
                        onAction={() => navigation.navigate("ProjectForm")}
                    />
                }
                renderItem={({ item: p }) => {
                    const managers = managersOf(p);
                    const shown = managers.slice(0, 3);
                    const extra = managers.length - shown.length;
                    return (
                        <Pressable
                            onPress={() => navigation.navigate("Project", { projectId: p.id, name: p.name })}
                            onLongPress={() => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                                setProjectMenu(p);
                            }}
                            delayLongPress={300}
                            accessibilityLabel={`Project ${p.name}`}
                            accessibilityHint="Opens the project. Long-press for actions."
                            style={({ pressed }) => [styles.card, { backgroundColor: colors.card, borderColor: colors.border, transform: [{ scale: pressed ? 0.98 : 1 }] }]}
                        >
                            <Ionicons name="folder-outline" size={24} color={p.color || colors.foreground} />
                            <View style={{ flex: 1, marginLeft: 14, marginRight: 8 }}>
                                <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>
                                    {p.name}
                                </Text>
                                <Text style={[styles.desc, { color: colors.mutedForeground }]} numberOfLines={1}>
                                    {p.description || "No description provided"}
                                </Text>
                            </View>
                            {shown.length ? (
                                <View style={styles.stack}>
                                    {shown.map((m, i) => (
                                        <View key={m.id} style={[styles.stackAvatar, { backgroundColor: colors.secondary, borderColor: colors.card, marginLeft: i === 0 ? 0 : -8 }]}>
                                            <Text style={{ fontFamily: fonts.bold, fontSize: 9, color: colors.foreground }}>{(m.surname?.[0] ?? "?").toUpperCase()}</Text>
                                        </View>
                                    ))}
                                    {extra > 0 ? (
                                        <View style={[styles.stackAvatar, { backgroundColor: colors.secondary, borderColor: colors.card, marginLeft: -8 }]}>
                                            <Text style={{ fontFamily: fonts.bold, fontSize: 9, color: colors.mutedForeground }}>+{extra}</Text>
                                        </View>
                                    ) : null}
                                </View>
                            ) : null}
                            <View style={[styles.arrow, { backgroundColor: colors.raised }]}>
                                <Ionicons name="arrow-forward" size={14} color={colors.foreground} />
                            </View>
                        </Pressable>
                    );
                }}
            />

            <ActionMenu
                open={moreOpen}
                onClose={() => setMoreOpen(false)}
                actions={[
                    { label: "New Project", icon: PlusIcon, hidden: !canCreate, onPress: () => navigation.navigate("ProjectForm") },
                    { label: "Tasks", icon: TasksIcon, onPress: () => navigation.navigate("Tasks") },
                    { label: "Ask Travis", icon: SparkIcon, onPress: () => navigation.navigate("Travis") },
                    { label: "My Profile", icon: ProfileIcon, onPress: () => navigation.navigate("Profile") },
                ]}
            />
            <ProjectActionsMenu project={projectMenu} onClose={() => setProjectMenu(null)} />
        </View>
    );
}

function HeaderBtn({ icon, label, bg, badge, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; bg: string; badge?: number; onPress: () => void }) {
    const { colors } = useTheme();
    return (
        <Pressable
            accessibilityLabel={label}
            hitSlop={8}
            onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                onPress();
            }}
            style={({ pressed }) => [styles.headerBtn, { backgroundColor: pressed ? colors.secondary : bg, borderColor: colors.border, transform: [{ scale: pressed ? 0.94 : 1 }] }]}
        >
            <Ionicons name={icon} size={20} color={colors.foreground} />
            {badge ? (
                <View style={[styles.badge, { backgroundColor: colors.badgeBg, borderColor: colors.background }]}>
                    <Text style={{ fontFamily: fonts.bold, fontSize: 10, color: colors.badgeFg }}>{badge > 9 ? "9+" : badge}</Text>
                </View>
            ) : null}
        </Pressable>
    );
}

// ActionMenu takes lucide-style components; wrap the old app's Ionicons glyphs.
const glyph = (name: keyof typeof Ionicons.glyphMap) =>
    function Glyph({ size, color }: { size?: number; color?: string }) {
        return <Ionicons name={name} size={size} color={color} />;
    };
const PlusIcon = glyph("add-circle-outline");
const TasksIcon = glyph("checkmark-done-outline");
const SparkIcon = glyph("sparkles-outline");
const ProfileIcon = glyph("person-circle-outline");

const styles = StyleSheet.create({
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 10, paddingBottom: 14 },
    title: { fontFamily: fonts.heading, fontSize: 24, lineHeight: 32, letterSpacing: -0.4 },
    headerBtn: { width: 44, height: 44, borderRadius: radius.md, borderWidth: 1, alignItems: "center", justifyContent: "center" },
    badge: { position: "absolute", top: -6, right: -6, minWidth: 20, height: 20, borderRadius: 10, borderWidth: 2, paddingHorizontal: 4, alignItems: "center", justifyContent: "center" },
    search: { flexDirection: "row", alignItems: "center", marginHorizontal: 20, marginBottom: 14, paddingHorizontal: 16, height: 50, borderRadius: radius.md, borderWidth: 1 },
    chips: { flexDirection: "row", gap: 8, paddingHorizontal: 20, marginBottom: 16 },
    chip: { paddingHorizontal: 14, height: 36, justifyContent: "center", borderRadius: 999, borderWidth: 1 },
    list: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 20 },
    card: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderRadius: radius.lg,
        borderWidth: 1,
        marginBottom: 10,
        minHeight: 74,
    },
    name: { fontFamily: fonts.semibold, fontSize: 15.5 },
    desc: { fontFamily: fonts.body, fontSize: 13, marginTop: 2 },
    stack: { flexDirection: "row", alignItems: "center", marginRight: 8 },
    stackAvatar: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
    arrow: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
});
