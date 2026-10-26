import { useState, type ComponentType } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { CalendarPlus, FileText, FolderPlus, ListTodo, MessageSquarePlus, PackagePlus, Palmtree, Sparkles, SquarePen, SquarePlus } from "lucide-react-native";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { qk } from "../../lib/query";
import { useTheme } from "../../theme/ThemeProvider";
import { fonts, radius } from "../../theme/tokens";
import { Sheet, Text } from "../ui";
import { TaskFormSheet } from "../task/TaskFormSheet";
import { ScheduleMeetingSheet } from "../calendar/MeetingSheets";
import { LeaveRequestSheet } from "../team/LeavesTab";
import { DailyReportSheet } from "../reports/DailyReportSheet";

type Action = { key: string; label: string; icon: ComponentType<{ size?: number; color?: string; strokeWidth?: number }>; color: string; show?: boolean; run: () => void };
type Form = "task" | "subtask" | "meeting" | "leave" | "report" | null;

/**
 * The tab bar's centre button: one place to start anything, the way ClickUp's
 * and Jira's quick-create works. Forms open as sheets over the current tab.
 */
export function CreateSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { colors } = useTheme();
    const navigation = useNavigation<any>();
    const qc = useQueryClient();
    const { workspaceId, permissions, isAdmin, can } = useWorkspace();
    const [form, setForm] = useState<Form>(null);
    const canCreateProject = permissions?.canCreateProject ?? isAdmin;

    // Close the menu first; the form sheet opens once the menu has slid away.
    const openForm = (f: Form) => {
        onClose();
        setTimeout(() => setForm(f), 260);
    };
    const go = (route: string, params?: object) => {
        onClose();
        navigation.navigate(route, params);
    };

    const actions: Action[] = [
        { key: "task", label: "Task", icon: SquarePlus, color: "#4f46e5", run: () => openForm("task") },
        { key: "subtask", label: "Subtask", icon: SquarePen, color: "#0ea5e9", run: () => openForm("subtask") },
        { key: "project", label: "Project", icon: FolderPlus, color: "#16a34a", show: canCreateProject, run: () => go("ProjectForm") },
        { key: "meeting", label: "Meeting", icon: CalendarPlus, color: "#8b5cf6", run: () => openForm("meeting") },
        { key: "indent", label: "Indent", icon: PackagePlus, color: "#ea580c", show: can("procurement:view"), run: () => go("IndentForm") },
        { key: "leave", label: "Leave", icon: Palmtree, color: "#a855f7", run: () => openForm("leave") },
        { key: "report", label: "Daily report", icon: FileText, color: "#0d9488", run: () => openForm("report") },
        { key: "todo", label: "To-do", icon: ListTodo, color: "#d97706", run: () => go("MySpace", { tab: "todo" }) },
        { key: "message", label: "Message", icon: MessageSquarePlus, color: "#2563eb", run: () => go("NewChat") },
        { key: "travis", label: "Ask Travis", icon: Sparkles, color: "#e11d48", run: () => go("Travis") },
    ];

    return (
        <>
            <Sheet open={open} onClose={onClose} title="Create" description="Start something new in this workspace.">
                {/* The two most-used starts get the big tiles: Task (lime, smile corner) and Ask Travis. */}
                <View style={styles.featured}>
                    {actions
                        .filter((a) => (a.key === "task" || a.key === "travis") && a.show !== false)
                        .map((a) => {
                            const Icon = a.icon;
                            const isTask = a.key === "task";
                            return (
                                <Pressable
                                    key={a.key}
                                    onPress={() => {
                                        Haptics.selectionAsync().catch(() => {});
                                        a.run();
                                    }}
                                    style={({ pressed }) => [
                                        styles.feature,
                                        isTask ? styles.smile : null,
                                        { backgroundColor: isTask ? colors.primary : colors.hero, transform: [{ scale: pressed ? 0.97 : 1 }] },
                                    ]}
                                >
                                    <Icon size={24} color={isTask ? colors.primaryForeground : colors.primary} strokeWidth={2} />
                                    <View>
                                        <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: isTask ? colors.primaryForeground : colors.heroForeground }}>{a.label}</Text>
                                        <Text style={{ fontFamily: fonts.body, fontSize: 12, marginTop: 2, color: isTask ? "#2C4A1E" : colors.heroMuted }} numberOfLines={1}>
                                            {isTask ? "Assign work with a due date" : "Let AI draft it for you"}
                                        </Text>
                                    </View>
                                </Pressable>
                            );
                        })}
                </View>
                <View style={styles.grid}>
                    {actions
                        .filter((a) => a.show !== false && a.key !== "task" && a.key !== "travis")
                        .map((a) => {
                            const Icon = a.icon;
                            return (
                                <Pressable
                                    key={a.key}
                                    onPress={() => {
                                        Haptics.selectionAsync().catch(() => {});
                                        a.run();
                                    }}
                                    style={({ pressed }) => [styles.cell, { transform: [{ scale: pressed ? 0.94 : 1 }] }]}
                                >
                                    <View style={[styles.tile, { backgroundColor: colors.iconTile, borderColor: colors.border }]}>
                                        <Icon size={22} color={colors.iconTileFg} strokeWidth={1.9} />
                                    </View>
                                    <Text style={{ fontFamily: fonts.medium, fontSize: 12, color: colors.foreground }} numberOfLines={1}>
                                        {a.label}
                                    </Text>
                                </Pressable>
                            );
                        })}
                </View>
            </Sheet>

            <TaskFormSheet open={form === "task"} onClose={() => setForm(null)} mode={{ kind: "task" }} />
            <TaskFormSheet open={form === "subtask"} onClose={() => setForm(null)} mode={{ kind: "subtask" }} />
            {form === "meeting" ? <ScheduleMeetingSheet onClose={() => setForm(null)} /> : null}
            {form === "leave" ? (
                <LeaveRequestSheet initial={null} onClose={() => setForm(null)} onSaved={() => qc.invalidateQueries({ queryKey: qk.leaves(workspaceId) })} />
            ) : null}
            <DailyReportSheet workspaceId={workspaceId} open={form === "report"} onClose={() => setForm(null)} onSubmitted={() => qc.invalidateQueries({ queryKey: qk.reportForm(workspaceId) })} />
        </>
    );
}

const styles = StyleSheet.create({
    featured: { flexDirection: "row", gap: 10 },
    feature: { flex: 1, height: 112, padding: 16, borderRadius: radius.lg, justifyContent: "space-between" },
    smile: { borderBottomRightRadius: 40 },
    grid: { flexDirection: "row", flexWrap: "wrap", rowGap: 16, marginTop: 4 },
    cell: { width: "25%", alignItems: "center", gap: 8 },
    tile: { width: 58, height: 58, borderRadius: 18, borderWidth: 1, alignItems: "center", justifyContent: "center" },
});
