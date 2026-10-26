import { useMemo, useState } from "react";
import { ActivityIndicator, Keyboard, Pressable, StyleSheet, TextInput, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Check, CheckCircle2, ChevronsUp, Circle, Pencil, Plus, Trash2 } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { myspaceApi } from "../../api/comms";
import { qk } from "../../lib/query";
import { toast } from "../../lib/toast";
import { useTheme } from "../../theme/ThemeProvider";
import { fonts, radius } from "../../theme/tokens";
import { ActionMenu, ListSkeleton, Text, confirm, tint } from "../ui";

type Todo = { id: string; text: string; completed: boolean; createdAt: string; completedAt: string | null };

/**
 * myspace/_components/personal-list-container.tsx — Ongoing and Completed
 * columns, stacked. The web reorders by drag; here a long press opens the same
 * reorder (move up / down / to top) plus edit and delete.
 */
export function TodoList({ workspaceId }: { workspaceId: string }) {
    const { colors } = useTheme();
    const qc = useQueryClient();
    const key = qk.todos(workspaceId);
    const q = useQuery({ queryKey: key, queryFn: () => myspaceApi.todos(workspaceId) as Promise<Todo[]>, enabled: !!workspaceId });
    const [draft, setDraft] = useState("");
    const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
    const [menuFor, setMenuFor] = useState<Todo | null>(null);

    const todos = q.data ?? [];
    const active = useMemo(() => todos.filter((t) => !t.completed), [todos]);
    const completed = useMemo(() => todos.filter((t) => t.completed), [todos]);
    const setTodos = (fn: (current: Todo[]) => Todo[]) => qc.setQueryData<Todo[]>(key, (old) => fn(old ?? []));
    const reload = () => qc.invalidateQueries({ queryKey: key });

    const add = useMutation({
        mutationFn: (text: string) => myspaceApi.addTodo(workspaceId, text) as Promise<Todo>,
        onSuccess: (todo) => {
            setTodos((current) => [todo, ...current]);
            setDraft("");
        },
        onError: (e) => toast.fromError(e, "Failed to add todo"),
    });

    const toggle = async (todo: Todo) => {
        if (todo.completed && !(await confirm({ title: "Restore Task?", message: "This task will be moved back to your ongoing list.", confirmLabel: "Yes, Restore" }))) return;
        if (!todo.completed) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        setTodos((current) => current.map((t) => (t.id === todo.id ? { ...t, completed: !t.completed } : t)));
        try {
            const updated = (await myspaceApi.toggleTodo(workspaceId, todo.id)) as Todo;
            setTodos((current) => current.map((t) => (t.id === todo.id ? updated : t)));
        } catch {
            toast.error("Failed to update status");
            reload();
        }
    };

    // Saved when the field loses focus (the check button just dismisses the keyboard).
    const saveEdit = async () => {
        const current = editing;
        setEditing(null);
        const text = current?.text.trim();
        if (!current || !text || text === todos.find((t) => t.id === current.id)?.text) return;
        setTodos((list) => list.map((t) => (t.id === current.id ? { ...t, text } : t)));
        try {
            const updated = (await myspaceApi.editTodo(workspaceId, current.id, text)) as Todo;
            setTodos((list) => list.map((t) => (t.id === updated.id ? updated : t)));
        } catch {
            toast.error("Failed to save changes");
            reload();
        }
    };

    const remove = async (todo: Todo) => {
        const ok = await confirm({
            title: "Delete Task?",
            message: "This action cannot be undone. This task will be permanently removed from your personal space.",
            confirmLabel: "Yes, Delete",
            destructive: true,
        });
        if (!ok) return;
        try {
            await myspaceApi.deleteTodo(workspaceId, todo.id);
            setTodos((current) => current.filter((t) => t.id !== todo.id));
            toast.success("Task deleted");
        } catch {
            toast.error("Failed to delete task");
        }
    };

    const move = async (todo: Todo, to: number) => {
        const from = active.findIndex((t) => t.id === todo.id);
        if (from < 0 || to < 0 || to >= active.length || from === to) return;
        const next = [...active];
        next.splice(to, 0, ...next.splice(from, 1));
        setTodos(() => [...next, ...completed]);
        try {
            await myspaceApi.reorderTodos(workspaceId, next.map((t) => t.id));
        } catch {
            toast.error("Failed to save reordered list");
            reload();
        }
    };

    if (q.isLoading) return <ListSkeleton rows={5} avatar={false} />;

    const canAdd = !!draft.trim() && !add.isPending;
    const index = menuFor ? active.findIndex((t) => t.id === menuFor.id) : -1;

    const row = (todo: Todo) => {
        const isEditing = editing?.id === todo.id;
        return (
            <Pressable
                key={todo.id}
                onPress={() => !todo.completed && !isEditing && setEditing({ id: todo.id, text: todo.text })}
                onLongPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                    setMenuFor(todo);
                }}
                delayLongPress={300}
                style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.secondary : "transparent", opacity: todo.completed ? 0.6 : 1 }]}
            >
                <Pressable hitSlop={10} onPress={() => toggle(todo)} style={{ paddingTop: 2 }}>
                    {todo.completed ? <CheckCircle2 size={20} color={colors.success} /> : <Circle size={20} color={colors.mutedForeground} strokeWidth={2} />}
                </Pressable>
                {isEditing ? (
                    <View style={{ flex: 1, flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                        <TextInput
                            autoFocus
                            multiline
                            value={editing.text}
                            onChangeText={(text) => setEditing({ id: todo.id, text })}
                            onBlur={saveEdit}
                            style={[styles.text, { flex: 1, color: colors.foreground, padding: 0 }]}
                            selectionColor={colors.primary}
                        />
                        <Pressable hitSlop={10} onPress={() => Keyboard.dismiss()} style={{ paddingTop: 2 }}>
                            <Check size={18} color={colors.primaryInk} />
                        </Pressable>
                    </View>
                ) : (
                    <Text
                        style={[
                            styles.text,
                            { flex: 1, color: todo.completed ? colors.mutedForeground : colors.foreground },
                            todo.completed ? { textDecorationLine: "line-through", fontFamily: fonts.body } : null,
                        ]}
                    >
                        {todo.text}
                    </Text>
                )}
            </Pressable>
        );
    };

    return (
        <View style={{ gap: 22 }}>
            <View style={{ gap: 6 }}>
                <SectionRule label="Ongoing" color={colors.primaryInk} />
                <View style={[styles.composer, { borderColor: colors.border, backgroundColor: colors.card }]}>
                    <View style={{ opacity: 0.4, paddingTop: 2 }}>
                        <Circle size={20} color={colors.mutedForeground} strokeWidth={2} />
                    </View>
                    <TextInput
                        placeholder="Add a new task..."
                        placeholderTextColor={colors.mutedForeground}
                        value={draft}
                        onChangeText={setDraft}
                        multiline
                        editable={!add.isPending}
                        style={[styles.text, { flex: 1, color: colors.foreground, maxHeight: 120, padding: 0 }]}
                        selectionColor={colors.primary}
                    />
                    <Pressable
                        disabled={!canAdd}
                        onPress={() => add.mutate(draft.trim())}
                        style={[styles.addBtn, { backgroundColor: canAdd ? colors.primary : tint(colors.primary, 0.4) }]}
                    >
                        {add.isPending ? (
                            <ActivityIndicator size="small" color={colors.primaryForeground} />
                        ) : draft.trim() ? (
                            <Check size={16} color={colors.primaryForeground} strokeWidth={3} />
                        ) : (
                            <Plus size={16} color={colors.primaryForeground} strokeWidth={2.5} />
                        )}
                    </Pressable>
                </View>
                {active.length === 0 ? <EmptyLine text="No pending tasks. You're all caught up!" /> : active.map(row)}
            </View>

            <View style={{ gap: 6 }}>
                <SectionRule label="Completed" color={colors.success} />
                {completed.length === 0 ? <EmptyLine text="No completed tasks yet." /> : completed.map(row)}
            </View>

            <ActionMenu
                open={!!menuFor}
                onClose={() => setMenuFor(null)}
                title={menuFor?.text}
                actions={
                    menuFor
                        ? [
                              { label: "Edit", icon: Pencil, hidden: menuFor.completed, onPress: () => setEditing({ id: menuFor.id, text: menuFor.text }) },
                              { label: "Move to top", icon: ChevronsUp, hidden: menuFor.completed || index <= 0, onPress: () => move(menuFor, 0) },
                              { label: "Move up", icon: ArrowUp, hidden: menuFor.completed || index <= 0, onPress: () => move(menuFor, index - 1) },
                              { label: "Move down", icon: ArrowDown, hidden: menuFor.completed || index >= active.length - 1, onPress: () => move(menuFor, index + 1) },
                              { label: menuFor.completed ? "Restore" : "Mark complete", icon: menuFor.completed ? Circle : CheckCircle2, onPress: () => toggle(menuFor) },
                              { label: "Delete", icon: Trash2, destructive: true, onPress: () => remove(menuFor) },
                          ]
                        : []
                }
            />
        </View>
    );
}

function SectionRule({ label, color }: { label: string; color: string }) {
    return (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Text style={{ fontFamily: fonts.bold, fontSize: 11, letterSpacing: 1.4, textTransform: "uppercase", color }}>{label}</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: tint(color, 0.3) }} />
        </View>
    );
}

function EmptyLine({ text }: { text: string }) {
    return (
        <Text variant="body" tone="muted" style={{ fontStyle: "italic", opacity: 0.6, paddingVertical: 12, paddingHorizontal: 8 }}>
            {text}
        </Text>
    );
}

const styles = StyleSheet.create({
    row: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 8, paddingHorizontal: 8, borderRadius: radius.md },
    text: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 22 },
    composer: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius.lg, borderWidth: 1, marginBottom: 6 },
    addBtn: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center" },
});
