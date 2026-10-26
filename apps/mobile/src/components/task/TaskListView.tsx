import { memo, useCallback, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, FileCheck2, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react-native";
import { tasksApi, type Task } from "../../api/tasks";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { useProjectAccess } from "../../hooks/useProjectAccess";
import { qk } from "../../lib/query";
import { statusColor } from "../../lib/constants";
import { fmtShortDate } from "../../lib/format";
import { can, canEditTask } from "../../lib/taskRules";
import { toast } from "../../lib/toast";
import { useTheme } from "../../theme/ThemeProvider";
import { fonts, radius } from "../../theme/tokens";
import { ActionMenu, EmptyState, ListSkeleton, ProgressBar, Text, confirm, tint } from "../ui";
import { StatusPicker } from "./StatusPicker";
import { AssigneeAvatar, DelayPill, TagChips } from "./TaskBits";
import { TaskFormSheet } from "./TaskFormSheet";
import { activeFilterCount, type TaskFilterState } from "./TaskFilters";

type Props = { projectId?: string; filters: TaskFilterState; header?: React.ReactElement };

/**
 * List view — components/task/list (task-table, task-row, subtask-row,
 * project-task-group). Parents expand into their subtasks; any filter flips
 * the list to matching subtasks, flat, as the web table does.
 */
export function TaskListView({ projectId, filters, header }: Props) {
    const { colors } = useTheme();
    const qc = useQueryClient();
    const { workspaceId, layout } = useWorkspace();
    const filtering = activeFilterCount(filters) > 0 || !!filters.search.trim();
    const [form, setForm] = useState<{ kind: "subtask"; parentTaskId: string; projectId: string } | { kind: "editTask"; task: Task } | { kind: "editSubtask"; task: Task } | null>(null);

    const params = {
        workspaceId,
        projectId: projectId ?? filters.projectId,
        viewMode: "list" as const,
        status: filters.status.length ? filters.status : undefined,
        assigneeId: filters.assigneeId.length ? filters.assigneeId : undefined,
        tagId: filters.tagId.length ? filters.tagId : undefined,
        search: filters.search.trim() || undefined,
        dueAfter: filters.dueAfter,
        dueBefore: filters.dueBefore,
        limit: 30,
        ...(filtering ? { onlySubtasks: true, includeSubTasks: false } : { hierarchyMode: "parents" as const, includeSubTasks: false }),
    };

    const query = useInfiniteQuery({
        queryKey: qk.tasks(workspaceId, { list: params }),
        initialPageParam: null as any,
        queryFn: ({ pageParam }) => tasksApi.list({ ...params, cursor: pageParam }),
        getNextPageParam: (last) => (last.hasMore ? last.nextCursor : undefined),
        enabled: !!workspaceId,
    });

    const rows = useMemo(() => {
        const tasks = (query.data?.pages ?? []).flatMap((p) => p.tasks);
        if (projectId || filtering) return tasks.map((t) => ({ type: "task" as const, task: t }));
        // Workspace scope: group consecutive parents under their project. The list
        // payload carries only projectId; names come from the sidebar's project list.
        const projects = new Map((layout?.projects ?? []).map((p: any) => [p.id, p]));
        const out: ({ type: "project"; id: string; name: string; color?: string } | { type: "task"; task: Task })[] = [];
        let last: string | null = null;
        for (const t of tasks) {
            if (t.projectId !== last) {
                // The list payload\'s project is only { id, createdAt }.
                const project: any = projects.get(t.projectId) ?? t.project;
                out.push({ type: "project", id: t.projectId, name: project?.name ?? "Unknown Project", color: project?.color });
                last = t.projectId;
            }
            out.push({ type: "task", task: t });
        }
        return out;
    }, [query.data, projectId, filtering, layout?.projects]);

    const remove = useMutation({
        mutationFn: (t: Task) => tasksApi.remove(t.id, { workspaceId, projectId: t.projectId }),
        onSuccess: () => {
            toast.success("Task deleted");
            qc.invalidateQueries({ queryKey: ["tasks"] });
        },
        onError: (e) => toast.fromError(e, "Failed to delete task"),
    });

    const renderItem = useCallback(
        ({ item }: { item: (typeof rows)[number] }) => {
            if (item.type === "project") {
                return (
                    <View style={styles.groupHeader}>
                        <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: item.color || colors.primary }} />
                        <Text variant="overline" tone="muted" style={{ fontSize: 11 }}>
                            {item.name}
                        </Text>
                    </View>
                );
            }
            if (filtering || item.task.isParent === false) {
                return <SubtaskRow task={item.task} showParent onEdit={(task) => setForm({ kind: "editSubtask", task })} onDelete={(t) => remove.mutate(t)} />;
            }
            return (
                <ParentRow
                    task={item.task}
                    filters={filters}
                    onAddSubtask={(t) => setForm({ kind: "subtask", parentTaskId: t.id, projectId: t.projectId })}
                    onEdit={(task) => setForm({ kind: "editTask", task })}
                    onEditSubtask={(task) => setForm({ kind: "editSubtask", task })}
                    onDelete={(t) => remove.mutate(t)}
                />
            );
        },
        [colors.primary, filtering, filters, remove],
    );

    return (
        <>
            <FlatList
                data={rows}
                keyExtractor={(item) => (item.type === "project" ? `p-${item.id}` : item.task.id)}
                renderItem={renderItem}
                ListHeaderComponent={header}
                ListHeaderComponentStyle={{ marginBottom: 12 }}
                contentContainerStyle={{ padding: 16, paddingBottom: 120, gap: 8 }}
                onEndReachedThreshold={0.4}
                onEndReached={() => query.hasNextPage && !query.isFetchingNextPage && query.fetchNextPage()}
                refreshControl={<RefreshControl refreshing={query.isRefetching && !query.isFetchingNextPage} onRefresh={() => query.refetch()} tintColor={colors.primaryInk} />}
                ListEmptyComponent={
                    query.isLoading ? (
                        <ListSkeleton rows={7} avatar={false} />
                    ) : (
                        <EmptyState icon={FileCheck2} title={filtering ? "No tasks match these filters" : "No tasks yet"} description={filtering ? "Try clearing a filter." : "Create a task to get started."} />
                    )
                }
                ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator style={{ marginTop: 12 }} color={colors.primaryInk} /> : null}
                initialNumToRender={14}
                windowSize={9}
                removeClippedSubviews
            />
            {form ? (
                <TaskFormSheet
                    open
                    onClose={() => setForm(null)}
                    mode={form.kind === "subtask" ? { kind: "subtask", parentTaskId: form.parentTaskId, projectId: form.projectId } : form}
                />
            ) : null}
        </>
    );
}

const ParentRow = memo(function ParentRow({
    task,
    filters,
    onAddSubtask,
    onEdit,
    onEditSubtask,
    onDelete,
}: {
    task: Task;
    filters: TaskFilterState;
    onAddSubtask: (t: Task) => void;
    onEdit: (t: Task) => void;
    onEditSubtask: (t: Task) => void;
    onDelete: (t: Task) => void;
}) {
    const { colors, shadow } = useTheme();
    const { workspaceId } = useWorkspace();
    const { access } = useProjectAccess(task.projectId);
    const [expanded, setExpanded] = useState(false);
    const [menu, setMenu] = useState(false);
    const total = task.subtaskCount ?? 0;
    const done = task.completedSubtaskCount ?? 0;

    const subtasks = useQuery({
        queryKey: qk.subtasks(task.id, { w: workspaceId }),
        queryFn: () => tasksApi.subtasks(task.id, { workspaceId, projectId: task.projectId, pageSize: 50 }),
        enabled: expanded && total > 0,
    });

    return (
        <View style={[styles.parent, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Pressable onPress={() => setExpanded((v) => !v)} style={styles.parentHead}>
                <View style={{ flex: 1, gap: 10 }}>
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <Text numberOfLines={2} style={{ flexShrink: 1, fontFamily: fonts.semibold, fontSize: 16, color: colors.foreground }}>
                            {task.name}
                        </Text>
                        {total > 0 ? (
                            <View style={[styles.countBadge, { backgroundColor: tint(colors.primary, 0.2) }]}>
                                <Text style={{ fontFamily: fonts.heading, fontSize: 10, color: colors.primaryInk }}>{total}</Text>
                            </View>
                        ) : null}
                    </View>
                    {total > 0 ? (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                            <View style={{ flex: 1 }}>
                                <ProgressBar value={(done / Math.max(1, total)) * 100} height={5} color={colors.success} />
                            </View>
                            <Text variant="caption" tone="muted">
                                {done}/{total}
                            </Text>
                        </View>
                    ) : null}
                </View>
                {can(access, "task:create") ? (
                    <Pressable hitSlop={8} onPress={() => onAddSubtask(task)} style={styles.iconBtn}>
                        <Plus size={18} color={colors.mutedForeground} />
                    </Pressable>
                ) : null}
                <Pressable hitSlop={8} onPress={() => setMenu(true)} style={styles.iconBtn}>
                    <MoreHorizontal size={17} color={colors.mutedForeground} />
                </Pressable>
                {expanded ? <ChevronDown size={18} color={colors.mutedForeground} /> : <ChevronRight size={18} color={colors.mutedForeground} />}
            </Pressable>
            {expanded ? (
                <View style={[styles.children, { borderTopColor: colors.border }]}>
                    {subtasks.isLoading ? (
                        <ActivityIndicator color={colors.primaryInk} style={{ padding: 12 }} />
                    ) : total === 0 || !subtasks.data?.subTasks.length ? (
                        <Text variant="small" tone="muted" style={{ padding: 12 }}>
                            No subtasks yet.
                        </Text>
                    ) : (
                        subtasks.data.subTasks.map((st) => (
                            <SubtaskRow key={st.id} task={{ ...st, projectId: st.projectId ?? task.projectId }} nested onEdit={onEditSubtask} onDelete={onDelete} />
                        ))
                    )}
                </View>
            ) : null}
            <ActionMenu
                open={menu}
                onClose={() => setMenu(false)}
                title={task.name}
                actions={[
                    { label: "Add subtask", icon: Plus, hidden: !can(access, "task:create"), onPress: () => onAddSubtask(task) },
                    { label: "Edit task", icon: Pencil, hidden: !can(access, "task:edit"), onPress: () => onEdit(task) },
                    {
                        label: "Delete task",
                        icon: Trash2,
                        destructive: true,
                        hidden: !(access.isWorkspaceAdmin || access.isProjectManager),
                        onPress: async () => {
                            if (await confirm({ title: `Delete "${task.name}"?`, message: "This deletes the task and all of its subtasks.", confirmLabel: "Delete", destructive: true })) onDelete(task);
                        },
                    },
                ]}
            />
        </View>
    );
});

export const SubtaskRow = memo(function SubtaskRow({
    task,
    nested,
    showParent,
    onEdit,
    onDelete,
}: {
    task: Task;
    nested?: boolean;
    showParent?: boolean;
    onEdit?: (t: Task) => void;
    onDelete?: (t: Task) => void;
}) {
    const { colors, shadow } = useTheme();
    const navigation = useNavigation<any>();
    const { access } = useProjectAccess(task.projectId);
    const { layout } = useWorkspace();
    const [menu, setMenu] = useState(false);
    const editable = canEditTask(access, task);
    const projectName = task.project?.name ?? layout?.projects?.find((p) => p.id === task.projectId)?.name;

    return (
        <Pressable
            onPress={() => navigation.navigate("TaskDetail", { taskId: task.id, title: task.name })}
            onLongPress={() => (editable || onDelete) && setMenu(true)}
            style={({ pressed }) => [
                nested ? styles.nested : [styles.flat, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: statusColor(task.status ?? "TO_DO") }],
                { backgroundColor: pressed ? colors.secondary : nested ? "transparent" : colors.card },
            ]}
        >
            <View style={{ flex: 1, gap: 7 }}>
                {showParent && (task.parentTask?.name || projectName) ? (
                    <Text variant="caption" tone="muted" numberOfLines={1}>
                        {[projectName, task.parentTask?.name].filter(Boolean).join(" / ")}
                    </Text>
                ) : null}
                <Text variant="bodyMedium" numberOfLines={2}>
                    {task.name}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <StatusPicker task={task} size="xs" />
                    <DelayPill dueDate={task.dueDate} status={task.status} />
                    {task.startDate || task.dueDate ? (
                        <Text variant="caption" tone="muted">
                            {fmtShortDate(task.startDate, "…")} → {fmtShortDate(task.dueDate, "…")}
                        </Text>
                    ) : null}
                    <TagChips tags={task.tags} />
                </View>
            </View>
            <AssigneeAvatar user={task.assignee} size={28} />
            <ActionMenu
                open={menu}
                onClose={() => setMenu(false)}
                title={task.name}
                actions={[
                    { label: "Open", icon: FileCheck2, onPress: () => navigation.navigate("TaskDetail", { taskId: task.id, title: task.name }) },
                    { label: "Edit subtask", icon: Pencil, hidden: !editable || !onEdit, onPress: () => onEdit?.(task) },
                    {
                        label: "Delete subtask",
                        icon: Trash2,
                        destructive: true,
                        hidden: !onDelete || !(access.isWorkspaceAdmin || access.isProjectManager || editable),
                        onPress: async () => {
                            if (await confirm({ title: `Delete "${task.name}"?`, confirmLabel: "Delete", destructive: true })) onDelete?.(task);
                        },
                    },
                ]}
            />
        </Pressable>
    );
});

const styles = StyleSheet.create({
    groupHeader: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 10, paddingHorizontal: 4 },
    // apps/mobile ProjectTaskList.tsx: bordered card, name with an amber count pill, chevron.
    parent: { borderRadius: radius.lg, borderWidth: 1, overflow: "hidden" },
    parentHead: { flexDirection: "row", alignItems: "center", gap: 6, padding: 16 },
    countBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: 8 },
    iconBtn: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
    children: { borderTopWidth: 1, paddingVertical: 4 },
    nested: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 11, marginLeft: 22 },
    flat: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: radius.lg, borderWidth: 1, borderLeftWidth: 4 },
});
