import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GanttChartSquare, Kanban, List, Plus } from "lucide-react-native";
import { useTheme } from "../../theme/ThemeProvider";
import { ActionMenu, Tabs } from "../ui";
import { GanttChart } from "./GanttChart";
import { KanbanBoard } from "./KanbanBoard";
import { TaskFilters, emptyFilters, useDebounced, type TaskFilterState } from "./TaskFilters";
import { TaskFormSheet } from "./TaskFormSheet";
import { TaskListView } from "./TaskListView";

export type TaskView = "list" | "kanban" | "gantt";

export const VIEW_TABS = [
    { key: "list" as const, label: "List", icon: List },
    { key: "kanban" as const, label: "Kanban", icon: Kanban },
    { key: "gantt" as const, label: "Gantt", icon: GanttChartSquare },
];

/**
 * List / Kanban / Gantt with the shared filter toolbar and a create button —
 * used by the workspace Tasks page and each project's task views.
 */
export function TaskViews({
    view,
    onViewChange,
    projectId,
    canCreateTask,
    canCreateSubtask,
    showViewSwitcher = true,
    createSignal,
    filterPreset,
}: {
    view: TaskView;
    onViewChange?: (v: TaskView) => void;
    projectId?: string;
    canCreateTask: boolean;
    canCreateSubtask: boolean;
    showViewSwitcher?: boolean;
    /** Bumped by an external Create button (the project header); replaces the floating one. */
    createSignal?: number;
    /** Replaces the filters whenever `at` changes (dashboard stat cards, Workload rows). */
    filterPreset?: { filters: Partial<TaskFilterState>; at: number };
}) {
    const { colors, shadow } = useTheme();
    const insets = useSafeAreaInsets();
    const [filters, setFilters] = useState<TaskFilterState>(() => ({ ...emptyFilters, ...filterPreset?.filters }));
    useEffect(() => {
        if (filterPreset) setFilters({ ...emptyFilters, ...filterPreset.filters });
    }, [filterPreset?.at]); // eslint-disable-line react-hooks/exhaustive-deps
    const search = useDebounced(filters.search);
    const effective = { ...filters, search };
    const [createMenu, setCreateMenu] = useState(false);
    const [form, setForm] = useState<"task" | "subtask" | null>(null);
    const openCreate = () => (canCreateTask && canCreateSubtask ? setCreateMenu(true) : setForm(canCreateTask ? "task" : "subtask"));
    useEffect(() => {
        if (createSignal && (canCreateTask || canCreateSubtask)) openCreate();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [createSignal]);

    const header = (
        <View style={{ gap: 12 }}>
            {showViewSwitcher && onViewChange ? <Tabs scrollable={false} items={VIEW_TABS} value={view} onChange={onViewChange} /> : null}
            <TaskFilters value={filters} onChange={setFilters} showProject={!projectId} showStatus={view !== "kanban"} placeholder={view === "kanban" ? "Search subtasks…" : "Search tasks…"} />
        </View>
    );

    return (
        <View style={{ flex: 1 }}>
            {view === "list" ? <TaskListView projectId={projectId} filters={effective} header={header} /> : null}
            {view === "kanban" ? <KanbanBoard projectId={projectId} filters={effective} header={header} /> : null}
            {view === "gantt" ? <GanttChart projectId={projectId} filters={effective} header={header} /> : null}

            {/* On the Tasks tab the tab bar's Create button covers this; a project page has no tab bar. */}
            {projectId && createSignal === undefined && (canCreateTask || canCreateSubtask) ? (
                <Pressable
                    onPress={openCreate}
                    style={({ pressed }) => [styles.fab, shadow.lg, { bottom: insets.bottom + 20, backgroundColor: colors.primary, transform: [{ scale: pressed ? 0.94 : 1 }] }]}
                >
                    <Plus size={24} color={colors.primaryForeground} strokeWidth={2.4} />
                </Pressable>
            ) : null}

            <ActionMenu
                open={createMenu}
                onClose={() => setCreateMenu(false)}
                title="Create"
                actions={[
                    { label: "New Task", description: "A parent task that groups subtasks", icon: List, onPress: () => setForm("task") },
                    { label: "New Subtask", description: "Work assigned to a person with dates", icon: Plus, onPress: () => setForm("subtask") },
                ]}
            />
            {form ? <TaskFormSheet open onClose={() => setForm(null)} mode={form === "task" ? { kind: "task", projectId } : { kind: "subtask", projectId }} /> : null}
        </View>
    );
}

const styles = StyleSheet.create({
    fab: { position: "absolute", right: 20, width: 58, height: 58, borderRadius: 20, alignItems: "center", justifyContent: "center" },
});
