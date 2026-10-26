import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Pressable, StyleSheet, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CheckCheck, Forward, Pencil, Send, Trash2, X } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { conversationsApi } from "../../api/comms";
import { useAuth } from "../../providers/AuthProvider";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { qk } from "../../lib/query";
import { realtime, EVENTS } from "../../lib/realtime";
import { displayName, fmtRelativeDay, fmtTime } from "../../lib/format";
import { toast } from "../../lib/toast";
import { useTheme } from "../../theme/ThemeProvider";
import { fonts, radius } from "../../theme/tokens";
import { ActionMenu, Avatar, Button, Checkbox, Sheet, Text } from "../../components/ui";
import { ScreenHeader, Screen } from "../../components/layout/Screen";
import type { RootStackParamList } from "../../navigation/types";
import { isOnline } from "./MessagesScreen";
import { brand } from "../../theme/tokens";

const EDIT_WINDOW_MS = 10 * 60 * 1000;

/** /myspace/conversations/[conversationId] — chat-panel.tsx. */
export function ChatScreen({ route }: NativeStackScreenProps<RootStackParamList, "Chat">) {
    const { conversationId, name, userId } = route.params;
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();
    const qc = useQueryClient();
    const auth = useAuth();
    const myId = auth.status === "signedIn" ? auth.user.id : "";
    const { workspaceId } = useWorkspace();
    const [text, setText] = useState("");
    const [editing, setEditing] = useState<any | null>(null);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [forwardOpen, setForwardOpen] = useState(false);
    const [targets, setTargets] = useState<Set<string>>(new Set());
    const [typing, setTyping] = useState(false);
    const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastTypingSent = useRef(0);

    const key = qk.messages(workspaceId, conversationId);
    const q = useInfiniteQuery({
        queryKey: key,
        initialPageParam: null as string | null,
        queryFn: ({ pageParam }) => conversationsApi.messages(workspaceId, conversationId, { cursor: pageParam, limit: 40 }),
        getNextPageParam: (last) => (last.hasMore ? last.nextCursor : undefined),
        enabled: !!workspaceId,
    });
    const messages = useMemo(() => (q.data?.pages ?? []).flatMap((p) => p.messages), [q.data]);
    const conversations = useQuery({ queryKey: qk.conversations(workspaceId), queryFn: () => conversationsApi.list(workspaceId), enabled: !!workspaceId });
    const other = conversations.data?.find((c: any) => c.id === conversationId)?.otherUser;

    useEffect(() => {
        conversationsApi.markRead(workspaceId, conversationId).then(() => qc.invalidateQueries({ queryKey: qk.conversations(workspaceId) })).catch(() => {});
        const offUpdate = realtime.subscribe(EVENTS.CONVERSATION_UPDATE, (data) => {
            if (data?.conversationId !== conversationId) return;
            qc.invalidateQueries({ queryKey: key });
            if (data.senderId && data.senderId !== myId) conversationsApi.markRead(workspaceId, conversationId).catch(() => {});
        });
        const offTyping = realtime.subscribe(EVENTS.TYPING, (data) => {
            if (data?.conversationId !== conversationId || data.userId === myId) return;
            setTyping(!!data.isTyping);
            if (typingTimer.current) clearTimeout(typingTimer.current);
            typingTimer.current = setTimeout(() => setTyping(false), 4000);
        });
        return () => {
            offUpdate();
            offTyping();
        };
    }, [conversationId, workspaceId, myId]); // eslint-disable-line react-hooks/exhaustive-deps

    const send = useMutation({
        mutationFn: (content: string) => conversationsApi.send(workspaceId, conversationId, content),
        onMutate: (content) => {
            const optimistic = { id: `temp-${Date.now()}`, content, senderId: myId, createdAt: new Date().toISOString(), pending: true };
            qc.setQueryData(key, (old: any) => (old ? { ...old, pages: old.pages.map((p: any, i: number) => (i === 0 ? { ...p, messages: [optimistic, ...p.messages] } : p)) } : old));
            setText("");
        },
        onError: (e) => toast.fromError(e, "Message not sent"),
        onSettled: () => {
            qc.invalidateQueries({ queryKey: key });
            qc.invalidateQueries({ queryKey: qk.conversations(workspaceId) });
        },
    });
    const edit = useMutation({
        mutationFn: ({ id, content }: { id: string; content: string }) => conversationsApi.edit(workspaceId, conversationId, id, content),
        onSuccess: () => {
            setEditing(null);
            setText("");
            qc.invalidateQueries({ queryKey: key });
        },
        onError: (e) => toast.fromError(e, "Couldn't edit the message"),
    });
    const remove = useMutation({
        mutationFn: (scope: "me" | "everyone") => conversationsApi.remove(workspaceId, conversationId, [...selected], scope),
        onSuccess: () => {
            setSelected(new Set());
            setDeleteOpen(false);
            qc.invalidateQueries({ queryKey: key });
        },
        onError: (e) => toast.fromError(e, "Couldn't delete"),
    });
    const forward = useMutation({
        mutationFn: () => conversationsApi.forward(workspaceId, conversationId, [...selected], [...targets]),
        onSuccess: () => {
            toast.success("Forwarded");
            setSelected(new Set());
            setTargets(new Set());
            setForwardOpen(false);
            qc.invalidateQueries({ queryKey: qk.conversations(workspaceId) });
        },
        onError: (e) => toast.fromError(e, "Failed to forward messages"),
    });

    const onChangeText = (v: string) => {
        setText(v);
        if (Date.now() - lastTypingSent.current > 2500) {
            lastTypingSent.current = Date.now();
            conversationsApi.typing(conversationId, true);
        }
    };
    const submit = () => {
        const content = text.trim();
        if (!content) return;
        if (editing) edit.mutate({ id: editing.id, content });
        else send.mutate(content);
    };

    const selecting = selected.size > 0;
    const selectedMessages = messages.filter((m) => selected.has(m.id));
    const allMine = selectedMessages.every((m) => m.senderId === myId);
    const single = selectedMessages.length === 1 ? selectedMessages[0] : null;
    const canEdit = !!single && single.senderId === myId && !single.isDeleted && Date.now() - new Date(single.createdAt).getTime() < EDIT_WINDOW_MS;
    const toggle = (id: string) =>
        setSelected((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });

    const online = isOnline(other?.lastActiveAt);

    return (
        <Screen>
            {selecting ? (
                <View style={[styles.selectBar, { paddingTop: insets.top + 6, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
                    <Pressable hitSlop={8} onPress={() => setSelected(new Set())} style={{ padding: 8 }}>
                        <X size={20} color={colors.foreground} />
                    </Pressable>
                    <Text variant="h3" style={{ flex: 1 }}>
                        {selected.size} selected
                    </Text>
                    {canEdit ? (
                        <Pressable hitSlop={8} style={{ padding: 8 }} onPress={() => { setEditing(single); setText(single.content); setSelected(new Set()); }}>
                            <Pencil size={19} color={colors.foreground} />
                        </Pressable>
                    ) : null}
                    <Pressable hitSlop={8} style={{ padding: 8 }} onPress={() => setForwardOpen(true)}>
                        <Forward size={20} color={colors.foreground} />
                    </Pressable>
                    <Pressable hitSlop={8} style={{ padding: 8 }} onPress={() => setDeleteOpen(true)}>
                        <Trash2 size={19} color={colors.destructive} />
                    </Pressable>
                </View>
            ) : (
                <ScreenHeader title={name ?? displayName(other)} subtitle={typing ? "typing…" : online ? "Online" : undefined} back showActions={false} />
            )}
            <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
                <FlatList
                    inverted
                    data={messages}
                    keyExtractor={(m) => m.id}
                    contentContainerStyle={{ padding: 14, gap: 4 }}
                    onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage()}
                    onEndReachedThreshold={0.3}
                    ListFooterComponent={q.isFetchingNextPage || q.isLoading ? <ActivityIndicator color={colors.primaryInk} style={{ margin: 12 }} /> : null}
                    renderItem={({ item: m, index }) => {
                        const mine = m.senderId === myId;
                        const older = messages[index + 1];
                        const showDay = !older || fmtRelativeDay(older.createdAt) !== fmtRelativeDay(m.createdAt);
                        const isSelected = selected.has(m.id);
                        const ticks = m.readAt || m.isRead ? "read" : m.deliveredAt ? "delivered" : "sent";
                        return (
                            <View>
                                {showDay ? (
                                    <View style={[styles.day, { backgroundColor: colors.secondary }]}>
                                        <Text variant="caption" tone="muted">
                                            {fmtRelativeDay(m.createdAt)}
                                        </Text>
                                    </View>
                                ) : null}
                                <Pressable
                                    onLongPress={() => {
                                        if (m.pending || m.isDeleted) return;
                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                                        toggle(m.id);
                                    }}
                                    onPress={() => selecting && !m.pending && toggle(m.id)}
                                    style={[styles.msgRow, { justifyContent: mine ? "flex-end" : "flex-start", backgroundColor: isSelected ? colors.accent : "transparent" }]}
                                >
                                    <View
                                        style={[
                                            styles.bubble,
                                            {
                                                backgroundColor: mine ? colors.hero : colors.card,
                                                borderColor: mine ? colors.hero : colors.border,
                                                borderBottomRightRadius: mine ? 6 : 18,
                                                borderBottomLeftRadius: mine ? 18 : 6,
                                                opacity: m.pending ? 0.6 : 1,
                                            },
                                        ]}
                                    >
                                        {m.isForwarded ? (
                                            <Text variant="caption" color={mine ? "rgba(216,226,229,0.7)" : colors.mutedForeground} style={{ fontStyle: "italic" }}>
                                                Forwarded
                                            </Text>
                                        ) : null}
                                        <Text variant="body" color={m.isDeleted ? (mine ? "rgba(216,226,229,0.7)" : colors.mutedForeground) : mine ? colors.heroForeground : colors.foreground} style={m.isDeleted ? { fontStyle: "italic" } : undefined}>
                                            {m.isDeleted ? "This message was deleted" : m.content}
                                        </Text>
                                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-end" }}>
                                            {m.editedAt && !m.isDeleted ? (
                                                <Text variant="caption" color={mine ? "rgba(216,226,229,0.7)" : colors.mutedForeground}>
                                                    edited
                                                </Text>
                                            ) : null}
                                            <Text variant="caption" color={mine ? "rgba(216,226,229,0.7)" : colors.mutedForeground}>
                                                {fmtTime(m.createdAt)}
                                            </Text>
                                            {mine && !m.pending ? ticks === "sent" ? <Check size={12} color="rgba(216,226,229,0.7)" /> : <CheckCheck size={13} color={ticks === "read" ? brand.sky : "rgba(216,226,229,0.7)"} /> : null}
                                        </View>
                                    </View>
                                </Pressable>
                            </View>
                        );
                    }}
                />
                {editing ? (
                    <View style={[styles.editing, { borderTopColor: colors.border, backgroundColor: colors.secondary }]}>
                        <Pencil size={14} color={colors.mutedForeground} />
                        <Text variant="small" tone="muted" style={{ flex: 1 }} numberOfLines={1}>
                            Editing: {editing.content}
                        </Text>
                        <Pressable hitSlop={8} onPress={() => { setEditing(null); setText(""); }}>
                            <X size={16} color={colors.mutedForeground} />
                        </Pressable>
                    </View>
                ) : null}
                <View style={[styles.composer, { borderTopColor: colors.border, backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom, 10) }]}>
                    <TextInput
                        value={text}
                        onChangeText={onChangeText}
                        placeholder="Type a message…"
                        placeholderTextColor={colors.mutedForeground}
                        multiline
                        maxLength={8000}
                        style={[styles.input, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}
                    />
                    <Pressable onPress={submit} disabled={!text.trim()} style={[styles.send, { backgroundColor: text.trim() ? colors.primary : colors.muted }]}>
                        <Send size={18} color={text.trim() ? colors.primaryForeground : colors.mutedForeground} />
                    </Pressable>
                </View>
            </KeyboardAvoidingView>

            <ActionMenu
                open={deleteOpen}
                onClose={() => setDeleteOpen(false)}
                title={`Delete ${selected.size} message${selected.size > 1 ? "s" : ""}?`}
                actions={[
                    { label: "Delete for me", icon: Trash2, description: "Hides the selection only in your chat.", onPress: () => remove.mutate("me") },
                    { label: "Delete for everyone", icon: Trash2, destructive: true, hidden: !allMine, description: "Replaces the messages for all participants.", onPress: () => remove.mutate("everyone") },
                ]}
            />
            <Sheet
                open={forwardOpen}
                onClose={() => setForwardOpen(false)}
                title="Forward to"
                footer={<Button title={`Forward${targets.size ? ` (${targets.size})` : ""}`} style={{ flex: 1 }} disabled={!targets.size} loading={forward.isPending} onPress={() => forward.mutate()} />}
            >
                {(conversations.data ?? [])
                    .filter((c: any) => c.id !== conversationId)
                    .map((c: any) => (
                        <Pressable
                            key={c.id}
                            onPress={() =>
                                setTargets((prev) => {
                                    const next = new Set(prev);
                                    next.has(c.id) ? next.delete(c.id) : next.add(c.id);
                                    return next;
                                })
                            }
                            style={styles.target}
                        >
                            <Avatar name={displayName(c.otherUser)} size={34} />
                            <Text variant="bodyMedium" style={{ flex: 1 }}>
                                {displayName(c.otherUser)}
                            </Text>
                            <Checkbox checked={targets.has(c.id)} />
                        </Pressable>
                    ))}
            </Sheet>
        </Screen>
    );
}

const styles = StyleSheet.create({
    selectBar: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingBottom: 10, borderBottomWidth: 1 },
    day: { alignSelf: "center", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, marginVertical: 8 },
    msgRow: { flexDirection: "row", paddingVertical: 2, borderRadius: radius.sm },
    bubble: { maxWidth: "80%", borderRadius: 18, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, gap: 3 },
    editing: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: 1 },
    composer: { flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 12, paddingTop: 10, borderTopWidth: 1 },
    input: { flex: 1, minHeight: 44, maxHeight: 130, borderRadius: 22, borderWidth: 1, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, fontFamily: fonts.body, fontSize: 15 },
    send: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
    target: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
});
