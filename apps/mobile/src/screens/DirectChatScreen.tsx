import React, { useState, useEffect, useRef } from "react";
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TextInput,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
    StatusBar,
    Image,
    Keyboard,
    Modal,
    Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList, DirectMessage, User } from "../types";
import { useTheme } from "../context/ThemeContext";
import { ListSkeleton } from "../components/ScreenSkeleton";
import { useWorkspace } from "../context/WorkspaceContext";
import { useNotifications } from "../context/NotificationContext";
import { PusherClient } from "../services/PusherClient";
import {
    getOrCreateConversation,
    getDirectMessagesPage,
    sendDirectMessage,
    getCachedSession,
    sendTypingIndicator,
    markConversationRead,
    editDirectMessage,
    deleteDirectMessages,
    forwardDirectMessages,
    getConversations,
} from "../services/api";
import { SPACING, BORDER_RADIUS, TOUCH_TARGET, FONTS } from "../constants/theme";
import { useResponsive } from "../hooks/useResponsive";
import { isToday, isYesterday, isSameDay, format as formatDate } from "date-fns";
import { getUserDisplayName, getUserDisplayInitial } from "../utils/userDisplayName";
import GlassSurface from "../components/GlassSurface";
import PressableScale from "../components/PressableScale";

type Props = NativeStackScreenProps<RootStackParamList, "DirectChat">;

const EDIT_WINDOW_MS = 10 * 60 * 1000;
const ONLINE_THRESHOLD_MS = 120000;
const POLL_INTERVAL_MS = 10000;

export default function DirectChatScreen({ route, navigation }: Props) {
    const { conversationId: initialId, otherUserId, otherUserName, otherUserRole } = route.params;
    const { colors, isDark } = useTheme();
    const { activeWorkspace } = useWorkspace();
    const { notifications, markAsRead } = useNotifications();
    const { MAX_CONTENT_WIDTH, value } = useResponsive();

    const [conversationId, setConversationId] = useState<string | null>(initialId || null);
    const [messages, setMessages] = useState<DirectMessage[]>([]);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [inputText, setInputText] = useState("");
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [isOtherTyping, setIsOtherTyping] = useState(false);
    const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastTypingSentRef = useRef<number>(0);
    const [isKeyboardVisible, setKeyboardVisible] = useState(false);
    const [hasOlderMessages, setHasOlderMessages] = useState(false);
    const [nextMessageCursor, setNextMessageCursor] = useState<string | null>(null);
    const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
    const [failedMessage, setFailedMessage] = useState<string | null>(null);
    const [otherLastActiveAt, setOtherLastActiveAt] = useState<string | null>(null);

    // Editing
    const [editingMessageId, setEditingMessageId] = useState<string | null>(null);

    // Multi-select
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const isSelecting = selectedIds.size > 0;

    // Action sheet (long-press menu)
    const [actionMessage, setActionMessage] = useState<DirectMessage | null>(null);

    // Forward
    const [forwardOpen, setForwardOpen] = useState(false);
    const [forwardCandidates, setForwardCandidates] = useState<any[]>([]);
    const [forwardTargets, setForwardTargets] = useState<Set<string>>(new Set());
    const [isForwarding, setIsForwarding] = useState(false);
    const forwardIdsRef = useRef<string[]>([]);

    const flatListRef = useRef<FlatList>(null);
    const workspaceId = activeWorkspace?.id;

    const isOnline = !!otherLastActiveAt && Date.now() - new Date(otherLastActiveAt).getTime() < ONLINE_THRESHOLD_MS;

    useEffect(() => {
        const showSubscription = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", () => {
            setKeyboardVisible(true);
        });
        const hideSubscription = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () => {
            setKeyboardVisible(false);
        });
        return () => {
            showSubscription.remove();
            hideSubscription.remove();
        };
    }, []);

    const markIncomingRead = async (page: DirectMessage[], convId: string, meId?: string) => {
        const hasUnreadIncoming = page.some((m) => m.senderId !== meId && !m.isRead);
        if (hasUnreadIncoming && workspaceId) {
            await markConversationRead(workspaceId, convId);
        }
    };

    const initChat = async () => {
        if (!activeWorkspace) return;
        setLoading(true);

        try {
            const session = await getCachedSession();
            const me = session?.user;
            if (me) setCurrentUser(me);

            let convId = conversationId;
            if (!convId) {
                const conv = await getOrCreateConversation(activeWorkspace.id, otherUserId);
                if (conv) {
                    convId = conv.id;
                    setConversationId(convId);
                    const other = (conv.UserConversations || []).find((uc: any) => uc.user?.id !== me?.id)?.user;
                    if (other?.lastActiveAt) setOtherLastActiveAt(other.lastActiveAt);
                }
            }

            if (convId) {
                const page = await getDirectMessagesPage(convId);
                setMessages(page.messages);
                setHasOlderMessages(page.hasMore);
                setNextMessageCursor(page.nextCursor);
                markIncomingRead(page.messages, convId, me?.id);
            }
        } catch (error) {
            console.error("Failed to init chat:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        initChat();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [conversationId, activeWorkspace?.id]);

    const loadOlderMessages = async () => {
        if (
            !conversationId ||
            !hasOlderMessages ||
            !nextMessageCursor ||
            loadingOlderMessages
        ) {
            return;
        }

        setLoadingOlderMessages(true);
        try {
            const page = await getDirectMessagesPage(
                conversationId,
                nextMessageCursor
            );
            setMessages((current) => {
                const existingIds = new Set(current.map((message) => message.id));
                return [
                    ...current,
                    ...page.messages.filter((message) => !existingIds.has(message.id)),
                ];
            });
            setHasOlderMessages(page.hasMore);
            setNextMessageCursor(page.nextCursor);
        } finally {
            setLoadingOlderMessages(false);
        }
    };

    // Merge a freshly-fetched first page into state (dedupe + apply edits/deletes),
    // matching the web client's mergeMessages behavior for its `since` refresh.
    const mergeLatest = (incoming: DirectMessage[]) => {
        setMessages((current) => {
            const byId = new Map(current.map((m) => [m.id, m]));
            incoming.forEach((m) => byId.set(m.id, { ...byId.get(m.id), ...m }));
            return Array.from(byId.values()).sort(
                (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );
        });
    };

    const refreshMessages = async () => {
        if (!conversationId) return;
        const page = await getDirectMessagesPage(conversationId);
        mergeLatest(page.messages);
        markIncomingRead(page.messages, conversationId, currentUser?.id);
    };

    // Realtime: every conversation event (new message, edit, delete, forward,
    // read receipt) is broadcast on the shared `team-{workspaceId}` channel as
    // `conversation_update` — there is no per-conversation channel server-side.
    // A 10s poll is kept as a fallback, mirroring the web client's own belt-
    // and-suspenders 5s interval.
    useEffect(() => {
        if (!conversationId || !workspaceId) return;

        const pusherKey = process.env.EXPO_PUBLIC_PUSHER_KEY;
        const pusherCluster = process.env.EXPO_PUBLIC_PUSHER_CLUSTER;
        if (!pusherKey || !pusherCluster) {
            console.error("[PUSHER] Missing EXPO_PUBLIC_PUSHER_KEY or EXPO_PUBLIC_PUSHER_CLUSTER. Real-time will not work!");
        }

        let pusher: PusherClient | null = null;
        if (pusherKey && pusherCluster) {
            pusher = new PusherClient(pusherKey, { cluster: pusherCluster });
            const channel = pusher.subscribe(`team-${workspaceId}`);

            channel.bind("conversation_update", (data: any) => {
                if (data?.conversationId !== conversationId) return;
                refreshMessages();
            });

            channel.bind("typing", (data: { conversationId: string; userId: string; isTyping: boolean }) => {
                if (data.conversationId !== conversationId || data.userId === currentUser?.id) return;
                setIsOtherTyping(data.isTyping);
            });
        }

        const poll = setInterval(refreshMessages, POLL_INTERVAL_MS);

        return () => {
            clearInterval(poll);
            if (pusher) {
                pusher.unsubscribe(`team-${workspaceId}`);
                pusher.disconnect();
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [conversationId, workspaceId, currentUser?.id]);

    // Mark messages as read when viewing this chat
    useEffect(() => {
        const unreadFromThisUser = notifications.filter(n =>
            n.data?.type === "direct_message" &&
            (n.data?.senderId === otherUserId || n.data?.conversationId === conversationId) &&
            !n.isRead
        );

        unreadFromThisUser.forEach(n => markAsRead(n.id));
    }, [notifications, otherUserId, conversationId]);

    const clearSelection = () => setSelectedIds(new Set());
    const toggleSelected = (messageId: string) => {
        setSelectedIds((previous) => {
            const next = new Set(previous);
            if (next.has(messageId)) next.delete(messageId);
            else next.add(messageId);
            return next;
        });
    };

    const handleTextChange = (text: string) => {
        setInputText(text);

        if (!conversationId) return;

        const now = Date.now();
        if (now - lastTypingSentRef.current > 2000) {
            sendTypingIndicator(conversationId, true);
            lastTypingSentRef.current = now;
        }

        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
        }

        typingTimeoutRef.current = setTimeout(() => {
            if (conversationId) {
                sendTypingIndicator(conversationId, false);
            }
        }, 3000);
    };

    const handleSend = async () => {
        if (!inputText.trim() || !conversationId || sending) return;

        const content = inputText.trim();

        if (editingMessageId) {
            if (!workspaceId) return;
            setSending(true);
            try {
                const updated = await editDirectMessage(workspaceId, conversationId, editingMessageId, content);
                if (updated) {
                    mergeLatest([updated]);
                    setEditingMessageId(null);
                    setInputText("");
                } else {
                    Alert.alert("Couldn't edit message", "Please try again.");
                }
            } finally {
                setSending(false);
            }
            return;
        }

        setInputText("");
        setSending(true);
        setFailedMessage(null);

        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        sendTypingIndicator(conversationId, false);

        try {
            const sent = await sendDirectMessage(conversationId, content);
            if (sent) {
                // The realtime channel only carries a change signal, not the
                // payload — append the server's own copy directly so sending
                // never depends on Pusher round-tripping back to us.
                mergeLatest([sent]);
            } else {
                throw new Error("send failed");
            }
        } catch (error) {
            console.error("Failed to send message:", error);
            setFailedMessage(content);
        } finally {
            setSending(false);
        }
    };

    const handleRetrySend = () => {
        if (!failedMessage) return;
        setInputText(failedMessage);
        setFailedMessage(null);
    };

    const beginEdit = (message: DirectMessage) => {
        setEditingMessageId(message.id);
        setInputText(message.content);
        clearSelection();
        setActionMessage(null);
    };

    const cancelEdit = () => {
        setEditingMessageId(null);
        setInputText("");
    };

    const openDeleteConfirm = (ids: string[]) => {
        setActionMessage(null);
        const targets = messages.filter((m) => ids.includes(m.id));
        const canDeleteForEveryone = targets.length > 0 && targets.every(
            (m) => m.senderId === currentUser?.id && !m.isDeleted
        );

        const runDelete = async (scope: "me" | "everyone") => {
            if (!workspaceId || !conversationId) return;
            const ok = await deleteDirectMessages(workspaceId, conversationId, ids, scope);
            if (!ok) {
                Alert.alert("Couldn't delete", "Please try again.");
                return;
            }
            if (scope === "me") {
                setMessages((prev) => prev.filter((m) => !ids.includes(m.id)));
            } else {
                setMessages((prev) => prev.map((m) =>
                    ids.includes(m.id) ? { ...m, content: "", isDeleted: true } : m
                ));
            }
            clearSelection();
        };

        const buttons: any[] = [{ text: "Cancel", style: "cancel" }];
        buttons.push({ text: "Delete for me", onPress: () => runDelete("me") });
        if (canDeleteForEveryone) {
            buttons.push({ text: "Delete for everyone", style: "destructive", onPress: () => runDelete("everyone") });
        }

        Alert.alert(
            ids.length === 1 ? "Delete message?" : `Delete ${ids.length} messages?`,
            "Delete for me hides this only in your chat. Delete for everyone replaces it for all participants.",
            buttons
        );
    };

    const openForward = async (ids: string[]) => {
        setActionMessage(null);
        setForwardTargets(new Set());
        forwardIdsRef.current = ids;
        setForwardOpen(true);
        if (workspaceId) {
            const all = await getConversations(workspaceId);
            setForwardCandidates(all.filter((c) => c.id !== conversationId));
        }
    };

    const submitForward = async () => {
        if (forwardTargets.size === 0 || !workspaceId || !conversationId) return;
        setIsForwarding(true);
        try {
            const ok = await forwardDirectMessages(
                workspaceId,
                conversationId,
                forwardIdsRef.current,
                Array.from(forwardTargets)
            );
            if (ok) {
                setForwardOpen(false);
                clearSelection();
            } else {
                Alert.alert("Couldn't forward", "Please try again.");
            }
        } finally {
            setIsForwarding(false);
        }
    };

    const formatDaySeparator = (date: Date) => {
        if (isToday(date)) return "Today";
        if (isYesterday(date)) return "Yesterday";
        return formatDate(date, "MMMM d, yyyy");
    };

    const deliveryIcon = (message: DirectMessage, tintOnPrimary: string, dimOnPrimary: string) => {
        if (message.readAt || message.isRead) {
            return <Ionicons name="checkmark-done" size={13} color={tintOnPrimary} />;
        }
        if (message.deliveredAt) {
            return <Ionicons name="checkmark-done" size={13} color={dimOnPrimary} />;
        }
        return <Ionicons name="checkmark" size={13} color={dimOnPrimary} />;
    };

    // `messages` is newest-first (index 0 = newest) to match the inverted FlatList.
    const renderMessage = ({ item, index }: { item: DirectMessage; index: number }) => {
        const isMe = item.senderId === currentUser?.id;
        const olderNeighbor = messages[index + 1];
        const newerNeighbor = messages[index - 1];

        const isFirstOfGroup = !olderNeighbor || olderNeighbor.senderId !== item.senderId;
        const isLastOfGroup = !newerNeighbor || newerNeighbor.senderId !== item.senderId;
        const showDaySeparator = !olderNeighbor || !isSameDay(new Date(olderNeighbor.createdAt), new Date(item.createdAt));
        const isSelected = selectedIds.has(item.id);
        const canEdit = isMe && !item.isDeleted && Date.now() - new Date(item.createdAt).getTime() <= EDIT_WINDOW_MS;

        return (
            <View>
                {showDaySeparator && (
                    <View style={styles.daySeparatorRow}>
                        <Text style={[styles.daySeparatorText, { color: colors.textDim, backgroundColor: colors.surfaceSolid }]}>
                            {formatDaySeparator(new Date(item.createdAt))}
                        </Text>
                    </View>
                )}
                <PressableScale
                    haptic={isSelecting ? "selection" : null}
                    onPress={() => {
                        if (isSelecting) toggleSelected(item.id);
                    }}
                    onLongPress={() => {
                        if (!isSelecting) setActionMessage(item);
                    }}
                    style={[
                        styles.messageRow,
                        isMe ? styles.myMessageRow : styles.otherMessageRow,
                        { marginBottom: isFirstOfGroup ? 10 : 2 },
                        isSelected && { backgroundColor: colors.primary + "14", borderRadius: BORDER_RADIUS.md },
                    ]}
                >
                    {isSelecting && (
                        <Ionicons
                            name={isSelected ? "checkmark-circle" : "ellipse-outline"}
                            size={20}
                            color={isSelected ? colors.primary : colors.textDim}
                            style={{ marginHorizontal: 6 }}
                        />
                    )}
                    <View
                        style={[
                            styles.messageBubble,
                            isMe
                                ? [
                                    styles.myBubble,
                                    { backgroundColor: colors.primary },
                                    !isLastOfGroup && styles.myBubbleGrouped,
                                    !isFirstOfGroup && styles.myBubbleGroupedTop,
                                ]
                                : [
                                    styles.otherBubble,
                                    { backgroundColor: colors.surfaceSolidRaised },
                                    !isLastOfGroup && styles.otherBubbleGrouped,
                                    !isFirstOfGroup && styles.otherBubbleGroupedTop,
                                ],
                        ]}
                    >
                        {item.isDeleted ? (
                            <Text style={[styles.messageText, styles.deletedText, { color: isMe ? colors.textInverse : colors.text }]}>
                                This message was deleted
                            </Text>
                        ) : (
                            <>
                                {item.isForwarded && (
                                    <View style={styles.forwardedRow}>
                                        <Ionicons name="arrow-redo" size={11} color={isMe ? "rgba(26,26,26,0.6)" : colors.textDim} />
                                        <Text style={[styles.forwardedText, { color: isMe ? "rgba(26,26,26,0.6)" : colors.textDim }]}>
                                            Forwarded
                                        </Text>
                                    </View>
                                )}
                                <Text style={[styles.messageText, { color: isMe ? colors.textInverse : colors.text }]}>
                                    {item.content}
                                </Text>
                            </>
                        )}
                        {isLastOfGroup && (
                            <View style={styles.messageMetaRow}>
                                {item.editedAt && !item.isDeleted && (
                                    <Text style={[styles.editedTag, { color: isMe ? "rgba(26,26,26,0.6)" : colors.textDim }]}>
                                        edited
                                    </Text>
                                )}
                                <Text style={[styles.messageTime, { color: isMe ? "rgba(26,26,26,0.6)" : colors.textDim }]}>
                                    {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </Text>
                                {isMe && deliveryIcon(item, "#7dd3fc", "rgba(26,26,26,0.6)")}
                            </View>
                        )}
                    </View>
                </PressableScale>
            </View>
        );
    };

    const otherDisplayName = getUserDisplayName({ name: otherUserName }, otherUserName);
    const actionCanEdit = !!actionMessage && actionMessage.senderId === currentUser?.id && !actionMessage.isDeleted &&
        Date.now() - new Date(actionMessage.createdAt).getTime() <= EDIT_WINDOW_MS;

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top"]}>
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                // On Android, the OS's own "resize" keyboard mode (the app's
                // default) already shrinks this screen's flex slot to exclude
                // both the keyboard and the sibling tab bar below it — adding
                // KeyboardAvoidingView's "height" behavior on top double-
                // compensates and was what pushed the input area behind the
                // tab bar. iOS has no such OS-level resize, so it still needs
                // "padding" here.
                behavior={Platform.OS === "ios" ? "padding" : undefined}
                keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
            >
                <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />

                <View style={{ flex: 1, maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center' }}>
                    <View style={[styles.header, { borderBottomColor: colors.border, paddingHorizontal: value(16, SPACING.xl, SPACING.xxl) }]}>
                        {isSelecting ? (
                            <>
                                <PressableScale onPress={clearSelection} style={styles.backBtn} accessibilityLabel="Cancel selection">
                                    <Ionicons name="close" size={24} color={colors.text} />
                                </PressableScale>
                                <Text style={[styles.headerName, { color: colors.text }]}>{selectedIds.size} selected</Text>
                                <View style={styles.selectionActions}>
                                    <PressableScale
                                        onPress={() => {
                                            const ids = Array.from(selectedIds).filter((id) => !messages.find((m) => m.id === id)?.isDeleted);
                                            if (ids.length > 0) openForward(ids);
                                        }}
                                        style={styles.selectionActionBtn}
                                        accessibilityLabel="Forward selected messages"
                                    >
                                        <Ionicons name="arrow-redo-outline" size={22} color={colors.text} />
                                    </PressableScale>
                                    <PressableScale
                                        onPress={() => openDeleteConfirm(Array.from(selectedIds))}
                                        style={styles.selectionActionBtn}
                                        accessibilityLabel="Delete selected messages"
                                    >
                                        <Ionicons name="trash-outline" size={22} color={colors.error} />
                                    </PressableScale>
                                </View>
                            </>
                        ) : (
                            <>
                                <PressableScale onPress={() => navigation.goBack()} style={styles.backBtn} accessibilityLabel="Go back">
                                    <Ionicons name="chevron-back" size={24} color={colors.text} />
                                </PressableScale>
                                <View style={styles.headerAvatarWrap}>
                                    <View style={[styles.headerAvatar, { backgroundColor: colors.primary }]}>
                                        <Text style={styles.headerAvatarText}>{getUserDisplayInitial({ name: otherUserName })}</Text>
                                    </View>
                                    {isOnline && (
                                        <View style={[styles.onlineDot, { borderColor: colors.background, backgroundColor: "#10b981" }]} />
                                    )}
                                </View>
                                <View style={styles.headerInfo}>
                                    <Text style={[styles.headerName, { color: colors.text }]} numberOfLines={1}>{otherDisplayName}</Text>
                                    {isOnline ? (
                                        <Text style={[styles.headerStatus, { color: "#10b981" }]}>Online</Text>
                                    ) : otherUserRole ? (
                                        <Text style={[styles.headerStatus, { color: colors.textDim, textTransform: 'lowercase' }]}>
                                            {otherUserRole}
                                        </Text>
                                    ) : null}
                                </View>
                                <View style={{ width: TOUCH_TARGET.min }} />
                            </>
                        )}
                    </View>

                    {loading ? (
                        <ListSkeleton rows={6} />
                    ) : (
                        <FlatList
                            ref={flatListRef}
                            data={messages}
                            renderItem={renderMessage}
                            keyExtractor={(item) => item.id}
                            contentContainerStyle={styles.listContent}
                            inverted
                            onEndReached={loadOlderMessages}
                            onEndReachedThreshold={0.3}
                            ListFooterComponent={
                                loadingOlderMessages ? (
                                    <ActivityIndicator
                                        size="small"
                                        color={colors.primary}
                                        style={{ paddingVertical: 12 }}
                                    />
                                ) : null
                            }
                            ListHeaderComponent={
                                isOtherTyping ? (
                                    <View style={styles.typingContainer}>
                                        <View style={[styles.typingBubble, { backgroundColor: colors.surfaceSolidRaised }]}>
                                            <Text style={[styles.typingText, { color: colors.textDim }]}>
                                                {otherDisplayName} is typing…
                                            </Text>
                                        </View>
                                    </View>
                                ) : null
                            }
                            ListEmptyComponent={
                                <View style={styles.center}>
                                    <Text style={{ color: colors.textDim }}>No messages yet. Send a greeting!</Text>
                                </View>
                            }
                        />
                    )}

                    {failedMessage && (
                        <PressableScale
                            onPress={handleRetrySend}
                            style={[styles.retryBanner, { backgroundColor: colors.error + "20", borderColor: colors.error }]}
                            haptic="warning"
                            accessibilityLabel="Message failed to send. Tap to retry."
                        >
                            <Ionicons name="alert-circle" size={16} color={colors.error} />
                            <Text style={[styles.retryText, { color: colors.error }]}>Message failed to send. Tap to retry.</Text>
                        </PressableScale>
                    )}

                    {editingMessageId && (
                        <View style={[styles.editingBanner, { backgroundColor: colors.surfaceHighlight, borderLeftColor: colors.primary }]}>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.editingBannerTitle, { color: colors.primary }]}>Editing message</Text>
                                <Text style={[styles.editingBannerText, { color: colors.textDim }]} numberOfLines={1}>{inputText}</Text>
                            </View>
                            <PressableScale onPress={cancelEdit} style={styles.editingBannerClose} accessibilityLabel="Cancel edit">
                                <Ionicons name="close" size={18} color={colors.textDim} />
                            </PressableScale>
                        </View>
                    )}

                    <GlassSurface
                        level="elevated"
                        allowBlur={false}
                        elevation="none"
                        style={[styles.inputArea, {
                            borderRadius: 0,
                            borderLeftWidth: 0,
                            borderRightWidth: 0,
                            borderBottomWidth: 0,
                            borderTopColor: colors.glassBorder,
                            paddingBottom: isKeyboardVisible ? 16 : (Platform.OS === "ios" ? 30 : 20),
                        }]}
                    >
                        <TextInput
                            style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceSolid, borderColor: colors.border }]}
                            placeholder="Type a message..."
                            placeholderTextColor={colors.textDim}
                            value={inputText}
                            onChangeText={handleTextChange}
                            multiline
                            accessibilityLabel="Message input"
                        />
                        <PressableScale
                            style={[styles.sendBtn, { backgroundColor: colors.primary }, (!inputText.trim() || sending) && { opacity: 0.5 }]}
                            onPress={handleSend}
                            disabled={!inputText.trim() || sending}
                            accessibilityLabel={editingMessageId ? "Save edit" : "Send message"}
                        >
                            {sending ? (
                                <ActivityIndicator size="small" color={colors.textInverse} />
                            ) : (
                                <Ionicons name={editingMessageId ? "checkmark" : "send"} size={20} color={colors.textInverse} />
                            )}
                        </PressableScale>
                    </GlassSurface>
                </View>
            </KeyboardAvoidingView>

            {/* Long-press action sheet */}
            <Modal visible={!!actionMessage} transparent animationType="fade" onRequestClose={() => setActionMessage(null)}>
                <PressableScale
                    haptic={null}
                    style={styles.sheetBackdrop}
                    onPress={() => setActionMessage(null)}
                >
                    <View />
                </PressableScale>
                <View style={[styles.sheetContainer, { backgroundColor: colors.surfaceSolid }]}>
                    {actionCanEdit && (
                        <PressableScale
                            haptic="selection"
                            style={styles.sheetItem}
                            onPress={() => actionMessage && beginEdit(actionMessage)}
                        >
                            <Ionicons name="pencil" size={19} color={colors.text} />
                            <Text style={[styles.sheetItemText, { color: colors.text }]}>Edit</Text>
                        </PressableScale>
                    )}
                    {actionMessage && !actionMessage.isDeleted && (
                        <PressableScale
                            haptic="selection"
                            style={styles.sheetItem}
                            onPress={() => actionMessage && openForward([actionMessage.id])}
                        >
                            <Ionicons name="arrow-redo-outline" size={19} color={colors.text} />
                            <Text style={[styles.sheetItemText, { color: colors.text }]}>Forward</Text>
                        </PressableScale>
                    )}
                    <PressableScale
                        haptic="selection"
                        style={styles.sheetItem}
                        onPress={() => {
                            if (actionMessage) toggleSelected(actionMessage.id);
                            setActionMessage(null);
                        }}
                    >
                        <Ionicons name="checkmark-circle-outline" size={19} color={colors.text} />
                        <Text style={[styles.sheetItemText, { color: colors.text }]}>Select</Text>
                    </PressableScale>
                    <PressableScale
                        haptic="warning"
                        style={styles.sheetItem}
                        onPress={() => actionMessage && openDeleteConfirm([actionMessage.id])}
                    >
                        <Ionicons name="trash-outline" size={19} color={colors.error} />
                        <Text style={[styles.sheetItemText, { color: colors.error }]}>Delete</Text>
                    </PressableScale>
                </View>
            </Modal>

            {/* Forward picker */}
            <Modal visible={forwardOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setForwardOpen(false)}>
                <SafeAreaView style={[styles.forwardContainer, { backgroundColor: colors.background }]} edges={["top"]}>
                    <View style={styles.forwardHeader}>
                        <Text style={[styles.forwardTitle, { color: colors.text }]}>Forward to…</Text>
                        <PressableScale onPress={() => setForwardOpen(false)} style={styles.closeBtn} accessibilityLabel="Close">
                            <Ionicons name="close" size={24} color={colors.text} />
                        </PressableScale>
                    </View>
                    <FlatList
                        data={forwardCandidates}
                        keyExtractor={(item) => item.id}
                        contentContainerStyle={{ padding: 16 }}
                        ListEmptyComponent={
                            <View style={styles.center}>
                                <Text style={{ color: colors.textDim }}>No other chats available.</Text>
                            </View>
                        }
                        renderItem={({ item }) => {
                            const checked = forwardTargets.has(item.id);
                            const name = getUserDisplayName(item.otherUser);
                            return (
                                <PressableScale
                                    haptic="selection"
                                    style={[styles.forwardRow, { borderColor: colors.border }]}
                                    onPress={() => setForwardTargets((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(item.id)) next.delete(item.id);
                                        else next.add(item.id);
                                        return next;
                                    })}
                                >
                                    <Ionicons
                                        name={checked ? "checkmark-circle" : "ellipse-outline"}
                                        size={20}
                                        color={checked ? colors.primary : colors.textDim}
                                    />
                                    <View style={[styles.avatar, { backgroundColor: colors.primary, width: 36, height: 36, borderRadius: 18 }]}>
                                        <Text style={[styles.avatarText, { fontSize: 14 }]}>{getUserDisplayInitial(item.otherUser)}</Text>
                                    </View>
                                    <Text style={[styles.forwardRowName, { color: colors.text }]}>{name}</Text>
                                </PressableScale>
                            );
                        }}
                    />
                    <View style={[styles.forwardFooter, { borderTopColor: colors.border }]}>
                        <PressableScale
                            style={[styles.forwardSubmitBtn, { backgroundColor: colors.primary }, forwardTargets.size === 0 && { opacity: 0.5 }]}
                            onPress={submitForward}
                            disabled={forwardTargets.size === 0 || isForwarding}
                        >
                            {isForwarding ? (
                                <ActivityIndicator size="small" color="#fff" />
                            ) : (
                                <Text style={styles.forwardSubmitText}>Forward</Text>
                            )}
                        </PressableScale>
                    </View>
                </SafeAreaView>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        gap: 10,
    },
    backBtn: { width: TOUCH_TARGET.min, height: TOUCH_TARGET.min, justifyContent: "center" },
    headerAvatarWrap: { position: "relative" },
    headerAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
    headerAvatarText: { color: "#fff", fontSize: 15, fontFamily: FONTS.bold },
    onlineDot: { position: "absolute", bottom: -1, right: -1, width: 12, height: 12, borderRadius: 6, borderWidth: 2, backgroundColor: "#10b981" },
    headerInfo: { flex: 1 },
    headerName: { fontSize: 16, fontFamily: FONTS.bold },
    headerStatus: { fontSize: 10, fontFamily: FONTS.semibold, marginTop: 2 },
    selectionActions: { flexDirection: "row", alignItems: "center", gap: 4 },
    selectionActionBtn: { width: TOUCH_TARGET.min, height: TOUCH_TARGET.min, alignItems: "center", justifyContent: "center" },

    center: { flex: 1, justifyContent: "center", alignItems: "center" },
    listContent: { padding: 16, paddingTop: 20 },

    daySeparatorRow: { alignItems: "center", marginVertical: 10 },
    daySeparatorText: {
        fontSize: 11,
        fontFamily: FONTS.bold,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: BORDER_RADIUS.full,
    },

    messageRow: { flexDirection: "row", width: "100%", alignItems: "center" },
    myMessageRow: { justifyContent: "flex-end" },
    otherMessageRow: { justifyContent: "flex-start" },

    messageBubble: {
        maxWidth: "80%",
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 18,
    },
    myBubble: { borderBottomRightRadius: 4 },
    myBubbleGrouped: { borderBottomRightRadius: 18 },
    myBubbleGroupedTop: { borderTopRightRadius: 4 },
    otherBubble: { borderBottomLeftRadius: 4 },
    otherBubbleGrouped: { borderBottomLeftRadius: 18 },
    otherBubbleGroupedTop: { borderTopLeftRadius: 4 },

    messageText: { fontSize: 15, lineHeight: 20 },
    deletedText: { fontStyle: "italic", opacity: 0.7 },
    forwardedRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 2 },
    forwardedText: { fontSize: 10, fontStyle: "italic" },
    messageMetaRow: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4, marginTop: 4 },
    editedTag: { fontSize: 10, fontStyle: "italic" },
    messageTime: { fontSize: 10 },

    retryBanner: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginHorizontal: 16,
        marginBottom: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: BORDER_RADIUS.md,
        borderWidth: 1,
    },
    retryText: { fontSize: 12, fontFamily: FONTS.semibold, flexShrink: 1 },

    editingBanner: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginHorizontal: 16,
        marginBottom: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: BORDER_RADIUS.md,
        borderLeftWidth: 3,
    },
    editingBannerTitle: { fontSize: 12, fontFamily: FONTS.bold },
    editingBannerText: { fontSize: 12, marginTop: 1 },
    editingBannerClose: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },

    inputArea: {
        flexDirection: "row",
        alignItems: "flex-end",
        padding: 12,
        paddingBottom: 12,
        borderTopWidth: 1,
    },
    input: {
        flex: 1,
        minHeight: 40,
        maxHeight: 100,
        borderRadius: 20,
        borderWidth: 1,
        paddingHorizontal: 16,
        paddingTop: 10,
        paddingBottom: 10,
        fontSize: 15,
    },
    sendBtn: {
        width: TOUCH_TARGET.min,
        height: TOUCH_TARGET.min,
        borderRadius: TOUCH_TARGET.min / 2,
        justifyContent: "center",
        alignItems: "center",
        marginLeft: 8,
    },
    typingContainer: {
        paddingHorizontal: 16,
        paddingVertical: 4,
        marginBottom: 8,
    },
    typingBubble: {
        alignSelf: "flex-start",
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 18,
        borderBottomLeftRadius: 4,
    },
    typingText: {
        fontSize: 12,
        fontStyle: 'italic',
    },

    sheetBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
    sheetContainer: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        borderTopLeftRadius: BORDER_RADIUS.xl,
        borderTopRightRadius: BORDER_RADIUS.xl,
        paddingVertical: 8,
        paddingBottom: 24,
    },
    sheetItem: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 20, paddingVertical: 14 },
    sheetItemText: { fontSize: 15, fontFamily: FONTS.semibold },

    forwardContainer: { flex: 1 },
    forwardHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingVertical: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: "rgba(0,0,0,0.1)",
    },
    forwardTitle: { fontSize: 18, fontFamily: FONTS.bold },
    closeBtn: { width: TOUCH_TARGET.min, height: TOUCH_TARGET.min, alignItems: "flex-end", justifyContent: "center" },
    forwardRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 8, borderBottomWidth: StyleSheet.hairlineWidth },
    forwardRowName: { fontSize: 15, fontFamily: FONTS.semibold },
    avatar: { alignItems: "center", justifyContent: "center" },
    avatarText: { color: "#fff", fontFamily: FONTS.bold },
    forwardFooter: { padding: 16, borderTopWidth: 1 },
    forwardSubmitBtn: { height: 50, borderRadius: BORDER_RADIUS.full, alignItems: "center", justifyContent: "center" },
    forwardSubmitText: { color: "#fff", fontSize: 15, fontFamily: FONTS.bold },
});
