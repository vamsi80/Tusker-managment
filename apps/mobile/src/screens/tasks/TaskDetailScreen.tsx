import { useEffect, useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Pressable, StyleSheet, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CalendarClock, ExternalLink, FileText, GitBranch, MoreHorizontal, Package, Paperclip, Pencil, Plus, Send, Trash2, UserRound } from "lucide-react-native";
import { dependencyIds, tasksApi, type Task } from "../../api/tasks";
import { projectsApi } from "../../api/projects";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { useAuth } from "../../providers/AuthProvider";
import { useProjectAccess } from "../../hooks/useProjectAccess";
import { qk } from "../../lib/query";
import { realtime, EVENTS } from "../../lib/realtime";
import { displayName, fmtDate, fmtDateTime, timeAgo } from "../../lib/format";
import { remainingDays } from "../../lib/delay";
import { can, canEditTask } from "../../lib/taskRules";
import { openAttachment, parseActivityAttachment } from "../../lib/attachments";
import { roleLabel } from "../../lib/constants";
import { toast } from "../../lib/toast";
import { useTheme } from "../../theme/ThemeProvider";
import { fonts, radius } from "../../theme/tokens";
import { ActionMenu, Avatar, Divider, EmptyState, ErrorState, ListSkeleton, MultiSelect, Select, Sheet, Tabs, Text, confirm, prompt } from "../../components/ui";
import { ScreenHeader, Screen } from "../../components/layout/Screen";
import { StatusPicker } from "../../components/task/StatusPicker";
import { DelayPill, TagChips } from "../../components/task/TaskBits";
import { TaskFormSheet } from "../../components/task/TaskFormSheet";
import { SubtaskRow } from "../../components/task/TaskListView";
import type { RootStackParamList } from "../../navigation/types";

/** The web's SubTaskDetailsSheet: header, then Messages / Review tabs. */
export function TaskDetailScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, "TaskDetail">) {
    const { taskId } = route.params;
    const { colors } = useTheme();
    const qc = useQueryClient();
    const { workspaceId } = useWorkspace();
    const [tab, setTab] = useState<"messages" | "review" | "subtasks">("messages");
    const [menu, setMenu] = useState(false);
    const [form, setForm] = useState<"edit" | "subtask" | null>(null);
    const [depsOpen, setDepsOpen] = useState(false);

    const detail = useQuery({ queryKey: qk.task(taskId), queryFn: () => tasksApi.detail(taskId) });
    const task: Task | undefined = detail.data?.task;
    const { access } = useProjectAccess(task?.projectId ?? task?.project?.id);

    useEffect(() => {
        tasksApi.markCommentsRead(taskId).catch(() => {});
        return realtime.subscribe(EVENTS.TASK_UPDATE, (data) => {
            const id = data?.newData?.id ?? data?.payload?.id ?? data?.entityId ?? data?.taskId;
            if (!id || id === taskId) qc.invalidateQueries({ queryKey: qk.task(taskId) });
        });
    }, [qc, taskId]);

    useEffect(() => {
        if (task?.isParent) setTab("subtasks");
    }, [task?.isParent]);

    const remove = useMutation({
        mutationFn: () => tasksApi.remove(taskId, { workspaceId, projectId: task!.projectId }),
        onSuccess: () => {
            toast.success("Task deleted");
            qc.invalidateQueries({ queryKey: ["tasks"] });
            navigation.goBack();
        },
        onError: (e) => toast.fromError(e, "Failed to delete task"),
    });

    if (detail.isError) {
        return (
            <Screen>
                <ScreenHeader title="Task" back />
                <ErrorState message={(detail.error as Error)?.message} onRetry={() => detail.refetch()} />
            </Screen>
        );
    }

    const editable = task ? canEditTask(access, task) : false;
    const needsPurchase = task?.tags?.some((t) => t.requirePurchase || t.name?.toLowerCase() === "procurement");

    return (
        <Screen>
            <ScreenHeader
                title={task?.isParent ? "Task" : "Subtask"}
                subtitle={task?.project?.name}
                back
                showActions={false}
                right={
                    task ? (
                        <Pressable hitSlop={8} onPress={() => setMenu(true)} style={{ padding: 8 }}>
                            <MoreHorizontal size={20} color={colors.foreground} />
                        </Pressable>
                    ) : null
                }
            />
            <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={0}>
                {!task ? (
                    <View style={{ padding: 16 }}>
                        <ListSkeleton rows={5} avatar={false} />
                    </View>
                ) : (
                    <>
                        <TaskHeader task={task} />
                        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
                            <Tabs
                                scrollable={false}
                                value={tab}
                                onChange={setTab}
                                items={[
                                    ...(task.isParent ? [{ key: "subtasks" as const, label: "Subtasks", count: detail.data?.subTasksPage?.totalCount }] : []),
                                    { key: "messages" as const, label: "Messages" },
                                    { key: "review" as const, label: "Review" },
                                ]}
                            />
                        </View>
                        {tab === "subtasks" ? (
                            <FlatList
                                data={detail.data?.subTasks ?? []}
                                keyExtractor={(s: Task) => s.id}
                                renderItem={({ item }) => <SubtaskRow task={{ ...item, projectId: item.projectId ?? task.projectId }} />}
                                contentContainerStyle={{ padding: 16, gap: 8 }}
                                ListHeaderComponent={
                                    can(access, "task:create") ? (
                                        <Pressable onPress={() => setForm("subtask")} style={[styles.addRow, { borderColor: colors.border }]}>
                                            <Plus size={16} color={colors.mutedForeground} />
                                            <Text variant="label" tone="muted">
                                                Add subtask
                                            </Text>
                                        </Pressable>
                                    ) : null
                                }
                                ListEmptyComponent={<EmptyState icon={FileText} title="No subtasks yet" compact />}
                            />
                        ) : tab === "messages" ? (
                            <MessagesTab task={task} initial={detail.data?.comments ?? []} />
                        ) : (
                            <ReviewTab task={task} initial={detail.data?.activities ?? []} />
                        )}
                    </>
                )}
            </KeyboardAvoidingView>

            {task ? (
                <>
                    <ActionMenu
                        open={menu}
                        onClose={() => setMenu(false)}
                        title={task.name}
                        actions={[
                            { label: task.isParent ? "Edit task" : "Edit subtask", icon: Pencil, hidden: !editable && !can(access, "task:edit"), onPress: () => setForm("edit") },
                            { label: "Add subtask", icon: Plus, hidden: !task.isParent || !can(access, "task:create"), onPress: () => setForm("subtask") },
                            { label: "Dependencies", icon: GitBranch, hidden: task.isParent || !editable, onPress: () => setDepsOpen(true) },
                            {
                                label: "Raise indent",
                                icon: Package,
                                hidden: task.isParent || !needsPurchase || !can(access, "indent:raise"),
                                onPress: () => navigation.navigate("IndentForm", { projectId: task.projectId, taskId: task.id, raisedInProject: true }),
                            },
                            {
                                label: "Ask Travis about this",
                                icon: ExternalLink,
                                onPress: () => navigation.navigate("Travis", { projectId: task.projectId, taskId: task.id }),
                            },
                            {
                                label: task.isParent ? "Delete task" : "Delete subtask",
                                icon: Trash2,
                                destructive: true,
                                hidden: !(access.isWorkspaceAdmin || access.isProjectManager || editable),
                                onPress: async () => {
                                    if (await confirm({ title: `Delete "${task.name}"?`, message: task.isParent ? "This deletes the task and all of its subtasks." : undefined, confirmLabel: "Delete", destructive: true }))
                                        remove.mutate();
                                },
                            },
                        ]}
                    />
                    {form ? (
                        <TaskFormSheet
                            open
                            onClose={() => setForm(null)}
                            mode={
                                form === "subtask"
                                    ? { kind: "subtask", projectId: task.projectId, parentTaskId: task.id }
                                    : task.isParent
                                      ? { kind: "editTask", task: { ...task, projectId: task.projectId ?? task.project?.id } }
                                      : { kind: "editSubtask", task: { ...task, projectId: task.projectId ?? task.project?.id } }
                            }
                            onSaved={() => qc.invalidateQueries({ queryKey: qk.task(taskId) })}
                        />
                    ) : null}
                    <DependenciesSheet open={depsOpen} onClose={() => setDepsOpen(false)} task={task} />
                </>
            ) : null}
        </Screen>
    );
}

function TaskHeader({ task }: { task: Task }) {
    const { colors } = useTheme();
    const qc = useQueryClient();
    const { workspaceId } = useWorkspace();
    const { access } = useProjectAccess(task.projectId);
    const days = remainingDays(task.dueDate);
    const canAssign = can(access, "task:assign") && !task.isParent;
    const members = useQuery({ queryKey: qk.projectMembers(task.projectId), queryFn: () => projectsApi.members(task.projectId), enabled: canAssign });

    const assign = useMutation({
        mutationFn: async (userId: string | null) => {
            const explanation = task.assignee ? await prompt({ title: "Reason for reassigning", placeholder: "Optional note for the team", required: false }) : undefined;
            if (explanation === null) throw new Error("cancelled");
            return tasksApi.setAssignee(task.id, { workspaceId, projectId: task.projectId }, userId, explanation || undefined);
        },
        onSuccess: () => {
            toast.success("Assignee updated");
            qc.invalidateQueries({ queryKey: qk.task(task.id) });
            qc.invalidateQueries({ queryKey: ["tasks"] });
        },
        onError: (e: any) => e?.message !== "cancelled" && toast.fromError(e, "Failed to change assignee"),
    });

    return (
        <View style={{ padding: 16, gap: 12 }}>
            {/* The slug is a URL key, not something to read; only the parent task is shown. */}
            {task.parentTask?.name ? (
                <Text variant="caption" tone="muted" numberOfLines={1}>
                    in {task.parentTask.name}
                </Text>
            ) : null}
            <Text variant="h2">{task.name}</Text>
            {task.description ? (
                <Text variant="body" tone="muted">
                    {task.description}
                </Text>
            ) : null}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                {!task.isParent ? <StatusPicker task={task} onChanged={() => qc.invalidateQueries({ queryKey: qk.task(task.id) })} /> : null}
                {!task.isParent ? <DelayPill dueDate={task.dueDate} status={task.status} /> : null}
                <TagChips tags={task.tags} max={3} />
            </View>
            <View style={[styles.metaGrid, { borderColor: colors.border, backgroundColor: colors.card }]}>
                {!task.isParent ? (
                    <Meta label="Assignee" icon={UserRound}>
                        {canAssign ? (
                            <Select
                                title="Assign to"
                                value={task.assignee?.id ?? null}
                                onChange={(v) => assign.mutate(v)}
                                options={(members.data ?? []).map((m: any) => ({ value: m.userId ?? m.id, label: displayName(m.user ?? m), description: roleLabel(m.projectRole) }))}
                                searchable
                                trigger={(open) => (
                                    <Pressable onPress={open} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                                        <Avatar name={task.assignee?.name ?? task.assignee?.surname} image={task.assignee?.image} size={22} />
                                        <Text variant="bodyMedium" numberOfLines={1}>
                                            {task.assignee ? displayName(task.assignee as any) : "Assign"}
                                        </Text>
                                    </Pressable>
                                )}
                            />
                        ) : (
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                                <Avatar name={task.assignee?.name ?? task.assignee?.surname} image={task.assignee?.image} size={22} />
                                <Text variant="bodyMedium">{task.assignee ? displayName(task.assignee as any) : "Unassigned"}</Text>
                            </View>
                        )}
                    </Meta>
                ) : null}
                <Meta label="Created by" icon={UserRound}>
                    <Text variant="bodyMedium">{task.createdBy ? displayName(task.createdBy as any) : "—"}</Text>
                </Meta>
                {!task.isParent ? (
                    <>
                        <Meta label="Start Date" icon={CalendarClock}>
                            <Text variant="bodyMedium">{fmtDate(task.startDate)}</Text>
                        </Meta>
                        <Meta label="Due Date" icon={CalendarClock}>
                            <Text variant="bodyMedium" tone={days !== null && days < 0 && task.status !== "COMPLETED" ? "destructive" : "default"}>
                                {fmtDate(task.dueDate)}
                                {days !== null && task.status !== "COMPLETED" && task.status !== "CANCELLED" ? ` · ${Math.abs(days)} Days` : ""}
                            </Text>
                        </Meta>
                    </>
                ) : null}
            </View>
        </View>
    );
}

function Meta({ label, icon: Icon, children }: { label: string; icon: any; children: React.ReactNode }) {
    const { colors } = useTheme();
    return (
        <View style={{ width: "50%", padding: 10, gap: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Icon size={12} color={colors.mutedForeground} />
                <Text variant="overline" tone="muted">
                    {label}
                </Text>
            </View>
            {children}
        </View>
    );
}

/** messages-tab.tsx: comment thread with a composer. */
function MessagesTab({ task, initial }: { task: Task; initial: any[] }) {
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();
    const qc = useQueryClient();
    const auth = useAuth();
    const myId = auth.status === "signedIn" ? auth.user.id : "";
    const [text, setText] = useState("");
    const listRef = useRef<FlatList>(null);

    const send = useMutation({
        mutationFn: (content: string) => tasksApi.addComment(task.id, content),
        onMutate: (content) => {
            qc.setQueryData(qk.task(task.id), (old: any) =>
                old ? { ...old, comments: [...(old.comments ?? []), { id: `temp-${Date.now()}`, content, createdAt: new Date().toISOString(), userId: myId, user: auth.status === "signedIn" ? auth.user : null, pending: true }] } : old,
            );
            setText("");
            setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
        },
        onError: (e) => toast.fromError(e, "Failed to post comment"),
        onSettled: () => qc.invalidateQueries({ queryKey: qk.task(task.id) }),
    });

    return (
        <View style={{ flex: 1 }}>
            <FlatList
                ref={listRef}
                data={initial}
                keyExtractor={(c) => c.id}
                contentContainerStyle={{ padding: 16, gap: 12, flexGrow: 1 }}
                onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
                ListEmptyComponent={<EmptyState title="No messages yet" description="Start the conversation about this task." compact />}
                renderItem={({ item }) => {
                    const mine = item.userId === myId;
                    return (
                        <View style={{ flexDirection: mine ? "row-reverse" : "row", gap: 8, alignItems: "flex-end", opacity: item.pending ? 0.6 : 1 }}>
                            {!mine ? <Avatar name={displayName(item.user)} image={item.user?.image} size={28} /> : null}
                            <View style={[styles.bubble, { backgroundColor: mine ? colors.hero : colors.card, borderColor: mine ? colors.hero : colors.border, borderBottomRightRadius: mine ? 6 : 18, borderBottomLeftRadius: mine ? 18 : 6 }]}>
                                {!mine ? (
                                    <Text variant="caption" weight="semibold" tone="muted">
                                        {displayName(item.user)}
                                    </Text>
                                ) : null}
                                <Text variant="body" color={mine ? colors.heroForeground : undefined}>
                                    {item.content}
                                </Text>
                                <Text variant="caption" numberOfLines={1} color={mine ? "rgba(216,226,229,0.7)" : colors.mutedForeground} style={{ textAlign: "right" }}>
                                    {timeAgo(item.createdAt)}
                                </Text>
                            </View>
                        </View>
                    );
                }}
            />
            <View style={[styles.composer, { borderTopColor: colors.border, backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom, 10) }]}>
                <TextInput
                    value={text}
                    onChangeText={setText}
                    placeholder="Write a message…"
                    placeholderTextColor={colors.mutedForeground}
                    multiline
                    style={[styles.input, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}
                />
                <Pressable
                    disabled={!text.trim() || send.isPending}
                    onPress={() => send.mutate(text.trim())}
                    style={[styles.send, { backgroundColor: text.trim() ? colors.primary : colors.muted }]}
                >
                    <Send size={18} color={text.trim() ? colors.primaryForeground : colors.mutedForeground} />
                </Pressable>
            </View>
        </View>
    );
}

/** activity-tab.tsx: the status-change log with its notes and attachments. */
function ReviewTab({ task, initial }: { task: Task; initial: any[] }) {
    const { colors } = useTheme();
    return (
        <FlatList
            data={initial}
            keyExtractor={(a) => a.id}
            contentContainerStyle={{ padding: 16, gap: 10 }}
            ListEmptyComponent={<EmptyState title="No review activity" description="Status changes with their notes and attachments appear here." compact />}
            renderItem={({ item }) => {
                const att = parseActivityAttachment(item.attachment);
                // "TO_DO -> REVIEW" then the note: the first line is the transition, shown as
                // a pill (from the attachment's statuses when present), the rest is the note.
                const lines = String(item.text ?? "").split(/\r?\n/);
                const hasPrefix = lines[0]?.includes(" -> ");
                const raw = item.attachment && typeof item.attachment === "object" ? item.attachment : null;
                const label = (s: string) => s.trim().replace(/_/g, " ");
                const transition = raw?.previousStatus && raw?.targetStatus ? [raw.previousStatus, raw.targetStatus] : hasPrefix ? lines[0].split(" -> ") : null;
                const note = (hasPrefix ? lines.slice(1).join("\n") : String(item.text ?? "")).trim();
                return (
                    <View style={[styles.activity, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                            <Avatar name={displayName(item.author)} image={item.author?.image} size={26} />
                            <Text variant="bodyMedium" style={{ flex: 1 }}>
                                {displayName(item.author)}
                            </Text>
                            <Text variant="caption" tone="muted">
                                {fmtDateTime(item.createdAt)}
                            </Text>
                        </View>
                        {transition ? (
                            <View style={[styles.transition, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                                <Text variant="label" tone="muted">
                                    {label(transition[0])}
                                </Text>
                                <ArrowRight size={12} color={colors.mutedForeground} />
                                <Text variant="label" tone="muted">
                                    {label(transition[1])}
                                </Text>
                            </View>
                        ) : null}
                        {note ? <Text variant="body">{note}</Text> : null}
                        {att.url ? (
                            <Pressable onPress={() => import("expo-web-browser").then((m) => m.openBrowserAsync(att.url!))} style={styles.attachment}>
                                <ExternalLink size={14} color={colors.info} />
                                <Text variant="small" color={colors.info} numberOfLines={1} style={{ flex: 1 }}>
                                    {att.url}
                                </Text>
                            </Pressable>
                        ) : null}
                        {att.files.map((file) => (
                            <Pressable key={file.key} onPress={() => openAttachment(file).catch((e) => toast.fromError(e))} style={[styles.attachment, { backgroundColor: colors.secondary }]}>
                                <Paperclip size={14} color={colors.foreground} />
                                <Text variant="small" numberOfLines={1} style={{ flex: 1 }}>
                                    {file.name}
                                </Text>
                            </Pressable>
                        ))}
                    </View>
                );
            }}
            ItemSeparatorComponent={() => <Divider style={{ opacity: 0 }} />}
        />
    );
}

/** dependency-picker.tsx: this subtask waits on sibling subtasks. */
function DependenciesSheet({ open, onClose, task }: { open: boolean; onClose: () => void; task: Task }) {
    const qc = useQueryClient();
    const { workspaceId } = useWorkspace();
    const siblings = useQuery({
        queryKey: qk.subtasks(task.parentTaskId ?? "", { siblings: true }),
        queryFn: () => tasksApi.subtasks(task.parentTaskId!, { workspaceId, projectId: task.projectId, viewMode: "gantt", pageSize: 100 }),
        enabled: open && !!task.parentTaskId,
    });
    const current = dependencyIds((siblings.data?.subTasks ?? []).find((s) => s.id === task.id) ?? task);
    const [selected, setSelected] = useState<string[]>(current);
    useEffect(() => setSelected(current), [open, siblings.dataUpdatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

    const save = useMutation({
        mutationFn: async () => {
            const ctx = { workspaceId, projectId: task.projectId };
            const toAdd = selected.filter((id) => !current.includes(id));
            const toRemove = current.filter((id) => !selected.includes(id));
            if (toAdd.length) await tasksApi.addDependencies(task.id, ctx, toAdd);
            for (const id of toRemove) await tasksApi.removeDependency(task.id, ctx, id);
        },
        onSuccess: () => {
            toast.success("Dependencies updated");
            qc.invalidateQueries({ queryKey: ["tasks", "subtasks"] });
            qc.invalidateQueries({ queryKey: qk.task(task.id) });
            onClose();
        },
        onError: (e) => toast.fromError(e, "Failed to update dependencies"),
    });

    return (
        <Sheet
            open={open}
            onClose={onClose}
            title="Dependencies"
            description="This subtask can start once the selected subtasks are done."
            footer={
                <>
                    <Pressable onPress={onClose} style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                        <Text variant="label" tone="muted">
                            Cancel
                        </Text>
                    </Pressable>
                    <Pressable onPress={() => save.mutate()} style={{ flex: 1, alignItems: "center", justifyContent: "center", height: 44 }}>
                        <Text variant="label" tone="primary">
                            {save.isPending ? "Saving…" : "Save"}
                        </Text>
                    </Pressable>
                </>
            }
        >
            <MultiSelect
                label="Depends on"
                values={selected}
                onChange={setSelected}
                searchable
                options={(siblings.data?.subTasks ?? []).filter((s) => s.id !== task.id).map((s) => ({ value: s.id, label: s.name, description: s.dueDate ? `Due ${fmtDate(s.dueDate)}` : undefined }))}
                placeholder={siblings.isLoading ? "Loading…" : "Select subtasks"}
            />
        </Sheet>
    );
}

const styles = StyleSheet.create({
    metaGrid: { flexDirection: "row", flexWrap: "wrap", borderWidth: 1, borderRadius: radius.lg },
    addRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderStyle: "dashed", borderRadius: radius.md, paddingVertical: 12, marginBottom: 4 },
    bubble: { maxWidth: "80%", borderRadius: 16, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, gap: 3 },
    composer: { flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 12, paddingTop: 10, borderTopWidth: 1 },
    input: { flex: 1, minHeight: 44, maxHeight: 120, borderRadius: 22, borderWidth: 1, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, fontFamily: fonts.body, fontSize: 15 },
    send: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
    activity: { borderWidth: 1, borderRadius: radius.lg, padding: 12, gap: 8 },
    transition: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.sm, borderWidth: 1, borderStyle: "dashed" },
    attachment: { flexDirection: "row", alignItems: "center", gap: 8, padding: 8, borderRadius: radius.sm },
});
