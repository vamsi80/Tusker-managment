import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Pressable, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { ArrowUp, History, MessageSquarePlus, Sparkles, Square } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { travisApi } from "../../api/comms";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { qk } from "../../lib/query";
import { toast } from "../../lib/toast";
import { timeAgo } from "../../lib/format";
import { useTheme } from "../../theme/ThemeProvider";
import { brand, fonts, radius } from "../../theme/tokens";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { EmptyState, ListSkeleton, Sheet, Text } from "../../components/ui";
import { Screen, ScreenHeader } from "../../components/layout/Screen";
import { TravisBubble, TypingBubble, messageFromEvents, type ChatMessage, type EntityRef } from "../../components/travis/TravisMessage";
import type { RootStackParamList } from "../../navigation/types";

const GREETING: ChatMessage = {
    id: "greeting",
    role: "assistant",
    text: "Hi, I'm **Travis**. Ask me about your workspace, or tell me what to create — I'll show a preview before anything changes.",
};
const makeId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Travis, the workspace agent (POST /ai/chat, /ai/confirm). Reads run straight
 * away; writes come back as a preview card that only runs on Confirm.
 */
export function TravisScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, "Travis">) {
    const { colors, scheme } = useTheme();
    const insets = useSafeAreaInsets();
    const { workspaceId, role } = useWorkspace();
    const selectedProjectId = route.params?.projectId;
    const selectedTaskId = route.params?.taskId;

    // Newest first: the list is inverted so it opens at the bottom.
    const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [conversationId, setConversationId] = useState<string | undefined>();
    const [historyOpen, setHistoryOpen] = useState(false);
    const abortRef = useRef<AbortController | null>(null);
    const lastPrompt = useRef("");

    useEffect(() => () => abortRef.current?.abort(), []);

    const suggestions = useMemo(() => {
        if (selectedTaskId) return ["Summarize this task.", "What's blocking this task?", "Who is working on this?", "Draft a status update for this task."];
        if (selectedProjectId) return ["Summarize this project.", "Show overdue tasks in this project.", "Who has the most open tasks here?", "What changed this week?"];
        const base = ["What should I focus on today?", "Show overdue tasks.", "What are my deadlines this week?", "Create a task for tomorrow.", "Draft my daily report."];
        if (role === "OWNER" || role === "ADMIN" || role === "MANAGER") base.push("Who has too much work?", "Show pending leave requests.", "Summarize pending indents.");
        return base;
    }, [role, selectedProjectId, selectedTaskId]);

    const setConfirmation = (id: string, state: NonNullable<Extract<ChatMessage, { role: "assistant" }>["confirmationState"]>) =>
        setMessages((list) => list.map((m) => (m.id === id && m.role === "assistant" ? { ...m, confirmationState: state } : m)));

    const send = useCallback(
        async (text?: string) => {
            const message = (text ?? input).trim();
            if (!message || loading || !workspaceId) return;
            Haptics.selectionAsync().catch(() => {});
            lastPrompt.current = message;
            setInput("");
            // Prior turns, oldest first, capped at the contract's 20.
            const history = messages
                .filter((m) => m.id !== GREETING.id)
                .slice(0, 20)
                .reverse()
                .map((m) => ({ role: m.role, content: m.text.slice(0, 8000) }));
            setMessages((list) => [{ id: makeId(), role: "user", text: message }, ...list]);
            setLoading(true);
            const controller = new AbortController();
            abortRef.current = controller;
            const clientRequestId = makeId();
            const res = await travisApi.chat(
                {
                    workspaceId,
                    message,
                    history,
                    conversationId,
                    currentScreen: selectedTaskId ? "TaskDetail" : selectedProjectId ? "Project" : "Travis",
                    selectedProjectId,
                    selectedTaskId,
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata",
                    locale: "en-IN",
                    clientRequestId,
                },
                controller.signal,
            );
            if (controller.signal.aborted) return;
            abortRef.current = null;
            if (res.conversationId) setConversationId(res.conversationId);
            setMessages((list) => [messageFromEvents(makeId(), res.events, "I'm not sure how to help with that.", clientRequestId), ...list]);
            setLoading(false);
        },
        [input, loading, workspaceId, messages, conversationId, selectedProjectId, selectedTaskId],
    );

    const stop = () => {
        abortRef.current?.abort();
        abortRef.current = null;
        setLoading(false);
    };

    const confirmWrite = async (msg: Extract<ChatMessage, { role: "assistant" }>) => {
        if (!msg.confirmation || loading) return;
        if (Date.now() > msg.confirmation.expiresAt) return setConfirmation(msg.id, "expired");
        setConfirmation(msg.id, "processing");
        setLoading(true);
        const controller = new AbortController();
        abortRef.current = controller;
        const res = await travisApi.confirm(msg.confirmation.token, msg.clientRequestId, controller.signal);
        if (controller.signal.aborted) return setConfirmation(msg.id, "pending");
        abortRef.current = null;
        setMessages((list) => [messageFromEvents(makeId(), res.events, "Done."), ...list]);
        setConfirmation(msg.id, res.success ? "confirmed" : "pending");
        if (res.success) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        setLoading(false);
    };

    const openEntity = (entity?: EntityRef, path?: string) => {
        const id = entity?.id ?? path?.split("/").filter(Boolean).pop();
        const type = entity?.type ?? (path?.split("/").filter(Boolean)[0] as EntityRef["type"] | undefined);
        if (!type) return;
        if ((type === "task" || type === "subtask") && id) navigation.navigate("TaskDetail", { taskId: id, title: entity?.label });
        else if (type === "project" && id) navigation.navigate("Project", { projectId: id, name: entity?.label });
        else if (type === "indent" && id) navigation.navigate("IndentDetail", { indentId: id });
        else if (type === "leave") navigation.navigate("Team", { tab: "leaves" });
        else if (type === "attendance") navigation.navigate("Team", { tab: "attendance" });
        else if (type === "member") navigation.navigate("Team", { tab: "members" });
        else if (type === "daily_report") navigation.navigate("Reports");
    };

    const newChat = () => {
        stop();
        setMessages([GREETING]);
        setConversationId(undefined);
    };

    const openThread = async (id: string) => {
        setHistoryOpen(false);
        stop();
        try {
            const { messages: rows } = await travisApi.messages(workspaceId, id);
            const restored: ChatMessage[] = rows.map((m) =>
                m.role.toLowerCase() === "user"
                    ? { id: m.id, role: "user", text: m.content }
                    : { id: m.id, role: "assistant", text: m.content, cards: Array.isArray(m.entityRefs) ? m.entityRefs : undefined },
            );
            setMessages([...restored.reverse(), GREETING]);
            setConversationId(id);
        } catch (e) {
            toast.fromError(e, "Couldn't open that conversation");
        }
    };

    const onlyGreeting = messages.length === 1;
    const canSend = !!input.trim() && !loading;

    return (
        <Screen>
            <ScreenHeader
                title="Travis"
                subtitle={selectedTaskId ? "Asking about this task" : selectedProjectId ? "Asking about this project" : "Your workspace assistant"}
                back
                showActions={false}
                right={
                    <View style={{ flexDirection: "row" }}>
                        <Pressable hitSlop={8} onPress={() => setHistoryOpen(true)} style={({ pressed }) => [styles.iconBtn, { backgroundColor: pressed ? colors.secondary : "transparent" }]}>
                            <History size={19} color={colors.foreground} />
                        </Pressable>
                        <Pressable hitSlop={8} onPress={newChat} style={({ pressed }) => [styles.iconBtn, { backgroundColor: pressed ? colors.secondary : "transparent" }]}>
                            <MessageSquarePlus size={19} color={colors.foreground} />
                        </Pressable>
                    </View>
                }
            />
            <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
                <FlatList
                    inverted
                    data={messages}
                    keyExtractor={(m) => m.id}
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={{ padding: 16, gap: 16 }}
                    ListHeaderComponent={loading ? <TypingBubble /> : null}
                    renderItem={({ item, index }) => (
                        <TravisBubble
                            message={item}
                            onOpenEntity={openEntity}
                            onConfirm={() => item.role === "assistant" && confirmWrite(item)}
                            onEdit={() => {
                                setConfirmation(item.id, "cancelled");
                                if (item.role === "assistant") setInput(item.confirmation?.summary ?? "");
                            }}
                            onCancel={() => setConfirmation(item.id, "cancelled")}
                            onRetry={index === 0 && !loading ? () => send(lastPrompt.current) : undefined}
                        />
                    )}
                    ListFooterComponent={
                        onlyGreeting ? (
                            <View style={{ alignItems: "center", gap: 10, paddingVertical: 24 }}>
                                {/* Brand primary gradient (lime → aqua) with the smile corner. */}
                                <View style={styles.hero}>
                                    <Svg width={64} height={64} style={StyleSheet.absoluteFill}>
                                        <Defs>
                                            <LinearGradient id="travis" x1="0" y1="0" x2="1" y2="1">
                                                <Stop offset="0" stopColor={brand.lime} />
                                                <Stop offset="1" stopColor={brand.aqua} />
                                            </LinearGradient>
                                        </Defs>
                                        <Rect width={64} height={64} fill="url(#travis)" />
                                    </Svg>
                                    <Sparkles size={28} color={brand.ink} strokeWidth={2} />
                                </View>
                                <Text variant="h1" style={{ marginTop: 6 }}>Ask Travis</Text>
                                <Text variant="body" tone="muted" center style={{ maxWidth: 280 }}>
                                    Find tasks, check deadlines, review leave or draft your report — in plain words.
                                </Text>
                            </View>
                        ) : null
                    }
                />

                {onlyGreeting ? (
                    <View style={styles.suggestions}>
                        {suggestions.map((s) => (
                            <Pressable
                                key={s}
                                onPress={() => send(s)}
                                style={({ pressed }) => [styles.chip, { borderColor: colors.border, backgroundColor: pressed ? colors.secondary : colors.card }]}
                            >
                                <Text variant="small" style={{ fontFamily: fonts.medium }}>
                                    {s}
                                </Text>
                            </Pressable>
                        ))}
                    </View>
                ) : null}

                <View style={[styles.composerWrap, { paddingBottom: Math.max(insets.bottom, 10), backgroundColor: colors.background }]}>
                    <View style={[styles.composer, { borderColor: scheme === "dark" ? brand.charcoal : colors.border, backgroundColor: colors.card }]}>
                        <TextInput
                            value={input}
                            onChangeText={setInput}
                            placeholder="Ask Travis anything…"
                            placeholderTextColor={colors.mutedForeground}
                            multiline
                            maxLength={2000}
                            style={[styles.input, { color: colors.foreground }]}
                            selectionColor={colors.primary}
                        />
                        {loading ? (
                            <Pressable onPress={stop} style={[styles.send, { backgroundColor: colors.foreground }]}>
                                <Square size={13} color={colors.background} fill={colors.background} />
                            </Pressable>
                        ) : (
                            <Pressable disabled={!canSend} onPress={() => send()} style={[styles.send, { backgroundColor: canSend ? colors.primary : colors.muted }]}>
                                <ArrowUp size={18} color={canSend ? colors.primaryForeground : colors.mutedForeground} strokeWidth={2.5} />
                            </Pressable>
                        )}
                    </View>
                    <Text variant="caption" tone="muted" center style={{ opacity: 0.7 }}>
                        Travis previews every change before it happens.
                    </Text>
                </View>
            </KeyboardAvoidingView>

            <ThreadsSheet open={historyOpen} onClose={() => setHistoryOpen(false)} workspaceId={workspaceId} activeId={conversationId} onOpen={openThread} />
        </Screen>
    );
}

function ThreadsSheet({ open, onClose, workspaceId, activeId, onOpen }: { open: boolean; onClose: () => void; workspaceId: string; activeId?: string; onOpen: (id: string) => void }) {
    const { colors } = useTheme();
    const q = useQuery({ queryKey: qk.travisThreads(workspaceId), queryFn: () => travisApi.conversations(workspaceId), enabled: open && !!workspaceId });
    const threads = q.data?.conversations ?? [];
    return (
        <Sheet open={open} onClose={onClose} title="Recent conversations">
            {q.isLoading ? (
                <ListSkeleton rows={4} avatar={false} />
            ) : threads.length === 0 ? (
                <EmptyState icon={History} title="No conversations yet" description="Your chats with Travis will show up here." compact />
            ) : (
                <View style={{ gap: 4 }}>
                    {threads.map((t) => (
                        <Pressable
                            key={t.id}
                            onPress={() => onOpen(t.id)}
                            style={({ pressed }) => [styles.thread, { backgroundColor: t.id === activeId ? colors.accent : pressed ? colors.secondary : "transparent" }]}
                        >
                            <Text variant="bodyMedium" numberOfLines={1} style={{ flex: 1 }}>
                                {t.title || "Untitled conversation"}
                            </Text>
                            <Text variant="caption" tone="muted">
                                {timeAgo(t.updatedAt)}
                            </Text>
                        </Pressable>
                    ))}
                </View>
            )}
        </Sheet>
    );
}

const styles = StyleSheet.create({
    iconBtn: { width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
    hero: { width: 64, height: 64, borderRadius: 18, borderBottomRightRadius: 34, overflow: "hidden", alignItems: "center", justifyContent: "center" },
    suggestions: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 20, paddingBottom: 12 },
    chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1 },
    composerWrap: { paddingHorizontal: 16, paddingTop: 10, gap: 6 },
    composer: { flexDirection: "row", alignItems: "flex-end", gap: 8, paddingLeft: 16, paddingRight: 6, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
    input: { flex: 1, fontFamily: fonts.body, fontSize: 15, maxHeight: 120, paddingVertical: 10 },
    send: { width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
    thread: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 12, borderRadius: radius.md },
});
