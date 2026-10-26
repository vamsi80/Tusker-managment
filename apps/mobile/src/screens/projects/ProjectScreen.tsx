import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Pencil, SlidersHorizontal, Sparkles, Users } from "lucide-react-native";
import { projectsApi } from "../../api/projects";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { useProjectAccess } from "../../hooks/useProjectAccess";
import { qk } from "../../lib/query";
import { can } from "../../lib/taskRules";
import { useTheme } from "../../theme/ThemeProvider";
import { fonts, radius } from "../../theme/tokens";
import { ActionMenu, Text } from "../../components/ui";
import { Screen } from "../../components/layout/Screen";
import { TaskViews } from "../../components/task/TaskViews";
import { ProjectDashboard } from "../../components/project/ProjectDashboard";
import { ProjectProcurement } from "../../components/project/ProjectProcurement";
import { ProjectMaterials } from "../../components/project/ProjectMaterials";
import type { RootStackParamList } from "../../navigation/types";

type View_ = "dashboard" | "list" | "kanban" | "gantt" | "procurement" | "materials";
type Glyph = keyof typeof Ionicons.glyphMap;

/** Dark ink on the amber active tab; white on #fbb54a fails contrast. */

/**
 * /w/[workspaceId]/p/[slug]/{dashboard,list,kanban,gantt,procurement,materials},
 * laid out like the old app's ProjectDetailScreen: back · colour dot · name,
 * then a segmented bar whose active tab fills with the brand amber.
 */
export function ProjectScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, "Project">) {
    const { projectId, name } = route.params;
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();
    const { layout, can: canWs } = useWorkspace();
    const { access } = useProjectAccess(projectId);
    const [view, setView] = useState<View_>((route.params.view as View_) ?? "dashboard");
    const [menu, setMenu] = useState(false);
    const [createSignal, setCreateSignal] = useState(0);
    const [filterPreset, setFilterPreset] = useState<{ filters: { status: string[] }; at: number } | undefined>();
    useEffect(() => {
        if (route.params.view) setView(route.params.view as View_);
    }, [route.params.view]);

    const listItem = layout?.projects.find((p) => p.id === projectId);
    const project = useQuery({ queryKey: qk.project(projectId), queryFn: () => projectsApi.get(projectId), initialData: undefined });
    const title = project.data?.name ?? listItem?.name ?? name ?? "Project";
    const canManage = !!listItem?.canManageMembers || access.isWorkspaceAdmin || access.isProjectManager;
    const canCreateTask = can(access, "task:create") && (access.isWorkspaceAdmin || access.isProjectManager || access.isProjectLead || access.isProjectCoordinator);
    const canCreateSubtask = can(access, "task:create");
    const isTaskView = view === "list" || view === "kanban" || view === "gantt";

    const tabs: { key: View_; label: string; icon: Glyph; active: Glyph }[] = [
        { key: "dashboard", label: "Dashboard", icon: "grid-outline", active: "grid" },
        { key: "list", label: "List", icon: "list-outline", active: "list" },
        { key: "kanban", label: "Kanban", icon: "albums-outline", active: "albums" },
        { key: "gantt", label: "Gantt", icon: "bar-chart-outline", active: "bar-chart" },
        ...(canWs("procurement:view") || can(access, "indent:raise") ? [{ key: "procurement" as const, label: "Procurement", icon: "cart-outline" as Glyph, active: "cart" as Glyph }] : []),
        { key: "materials", label: "Materials", icon: "cube-outline", active: "cube" },
    ];

    return (
        <Screen>
            {/* Header: back, project colour dot, name; create + more on the right. */}
            <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.background }]}>
                <Pressable onPress={() => navigation.goBack()} hitSlop={8} style={[styles.back, { backgroundColor: colors.card, borderColor: colors.border }]} accessibilityLabel="Go back">
                    <Ionicons name="chevron-back" size={22} color={colors.foreground} />
                </Pressable>
                <View style={styles.titleWrap}>
                    <View style={[styles.dot, { backgroundColor: listItem?.color || colors.primary }]} />
                    <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: fonts.heading, fontSize: 18, lineHeight: 24, color: colors.foreground }} numberOfLines={1}>
                            {title}
                        </Text>
                        {listItem?.projectRole ? (
                            <Text variant="caption" tone="muted" numberOfLines={1} style={{ textTransform: "capitalize" }}>
                                {listItem.projectRole.replace(/_/g, " ").toLowerCase()}
                            </Text>
                        ) : null}
                    </View>
                </View>
                {isTaskView && (canCreateTask || canCreateSubtask) ? (
                    <Pressable onPress={() => setCreateSignal((n) => n + 1)} style={[styles.roundBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]} accessibilityLabel="Create task">
                        <Ionicons name="add" size={24} color={colors.primaryForeground} />
                    </Pressable>
                ) : null}
                <Pressable onPress={() => setMenu(true)} style={[styles.roundBtn, { backgroundColor: colors.card, borderColor: colors.border }]} accessibilityLabel="Project options">
                    <Ionicons name="ellipsis-horizontal" size={20} color={colors.foreground} />
                </Pressable>
            </View>

            {/* Segmented view switcher. */}
            <View style={[styles.tabsWrap, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
                    {tabs.map((t) => {
                        const active = t.key === view;
                        return (
                            <Pressable
                                key={t.key}
                                accessibilityRole="tab"
                                accessibilityState={{ selected: active }}
                                onPress={() => {
                                    if (!active) Haptics.selectionAsync().catch(() => {});
                                    setView(t.key);
                                }}
                                style={[styles.tab, { borderBottomColor: active ? colors.primaryInk : "transparent" }]}
                            >
                                <Ionicons name={active ? t.active : t.icon} size={17} color={active ? colors.foreground : colors.mutedForeground} />
                                <Text style={{ fontFamily: active ? fonts.semibold : fonts.medium, fontSize: 14, color: active ? colors.foreground : colors.mutedForeground }} numberOfLines={1}>
                                    {t.label}
                                </Text>
                            </Pressable>
                        );
                    })}
                </ScrollView>
            </View>

            <View style={{ flex: 1 }}>
                {view === "dashboard" ? (
                    <ProjectDashboard
                        projectId={projectId}
                        onStatPress={({ status }) => {
                            // "Total" clears the filter; the others narrow List to their statuses.
                            setFilterPreset({ filters: { status: status ?? [] }, at: Date.now() });
                            setView("list");
                        }}
                    />
                ) : null}
                {isTaskView ? (
                    <TaskViews view={view} projectId={projectId} showViewSwitcher={false} canCreateTask={canCreateTask} canCreateSubtask={canCreateSubtask} createSignal={createSignal} filterPreset={filterPreset} />
                ) : null}
                {view === "procurement" ? <ProjectProcurement projectId={projectId} /> : null}
                {view === "materials" ? <ProjectMaterials projectId={projectId} /> : null}
            </View>
            <ActionMenu
                open={menu}
                onClose={() => setMenu(false)}
                title={title}
                actions={[
                    { label: "Edit Project", icon: Pencil, hidden: !canManage, onPress: () => navigation.navigate("ProjectForm", { projectId }) },
                    { label: "Manage Members", icon: Users, hidden: !canManage, onPress: () => navigation.navigate("ProjectSettings", { projectId }) },
                    { label: "Project settings", icon: SlidersHorizontal, hidden: !canManage, onPress: () => navigation.navigate("ProjectSettings", { projectId }) },
                    { label: "Ask Travis about this project", icon: Sparkles, onPress: () => navigation.navigate("Travis", { projectId }) },
                ]}
            />
        </Screen>
    );
}

const styles = StyleSheet.create({
    header: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, paddingBottom: 12 },
    back: { width: 44, height: 44, borderRadius: radius.md, borderWidth: 1, alignItems: "center", justifyContent: "center" },
    titleWrap: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, paddingLeft: 4 },
    dot: { width: 10, height: 10, borderRadius: 3 },
    roundBtn: { width: 44, height: 44, borderRadius: radius.md, borderWidth: 1, alignItems: "center", justifyContent: "center" },
    tabsWrap: { borderBottomWidth: 1 },
    tabs: { flexDirection: "row", alignItems: "flex-end", gap: 22, paddingHorizontal: 20, height: 44 },
    tab: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 44, borderBottomWidth: 2 },
});
