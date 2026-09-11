import React, { useState, useEffect, useMemo } from "react";
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    ActivityIndicator,
    StatusBar,
    Image,
    TextInput,
    Platform,
    DeviceEventEmitter
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList, WorkspaceMember, User } from "../types";
import { useTheme } from "../context/ThemeContext";
import { ListSkeleton } from "../components/ScreenSkeleton";
import { useWorkspace } from "../context/WorkspaceContext";
import { getWorkspaceMembers, getCachedSession, getConversations } from "../services/api";
import { SPACING, BORDER_RADIUS, TOUCH_TARGET, FONTS } from "../constants/theme";
import { format, isToday } from "date-fns";
import { useResponsive } from "../hooks/useResponsive";
import PressableScale from "../components/PressableScale";
import StatusChip from "../components/StatusChip";
import EmptyState from "../components/EmptyState";
import MemberDetailModal from "../components/MemberDetailModal";

type Props = NativeStackScreenProps<RootStackParamList, "TeamList">;

type TeamTab = "messages" | "members";

export default function TeamListScreen({ navigation }: Props) {
    const insets = useSafeAreaInsets();
    const { colors, isDark } = useTheme();
    const { activeWorkspace } = useWorkspace();
    const { MAX_CONTENT_WIDTH, value } = useResponsive();

    const [loadingChats, setLoadingChats] = useState(true);
    const [loadingMembers, setLoadingMembers] = useState(true);
    const [conversations, setConversations] = useState<any[]>([]);
    const [members, setMembers] = useState<WorkspaceMember[]>([]);
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [searchQuery, setSearchQuery] = useState("");

    const [activeTab, setActiveTab] = useState<TeamTab>("messages");
    const [memberDetail, setMemberDetail] = useState<WorkspaceMember | null>(null);

    // Headcount workload is management information on the web dashboard too —
    // owners, admins and managers only (team-members-table.tsx canSeeWorkload).
    // Everyone else should not see teammates' open task counts.
    const myRole = members.find(m => m.userId === currentUser?.id || m.user.id === currentUser?.id)?.workspaceRole?.toUpperCase();
    const canSeeWorkload = myRole === "OWNER" || myRole === "ADMIN" || myRole === "MANAGER";

    const filteredMembers = useMemo(() => {
        let result = [...members];

        // Sort: "You" first, then alphabetical by full name
        result.sort((a, b) => {
            const isMeA = a.userId === currentUser?.id || a.user.id === currentUser?.id;
            const isMeB = b.userId === currentUser?.id || b.user.id === currentUser?.id;

            if (isMeA) return -1;
            if (isMeB) return 1;

            const fullNameA = (a.user.surname || a.user.name).toLowerCase();
            const fullNameB = (b.user.surname || b.user.name).toLowerCase();
            return fullNameA.localeCompare(fullNameB);
        });

        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            result = result.filter(m => {
                const fullName = (m.user.surname || m.user.name).toLowerCase();
                const email = m.user.email?.toLowerCase() || "";
                return fullName.includes(query) || email.includes(query);
            });
        }

        return result;
    }, [members, searchQuery, currentUser?.id]);

    const fetchChats = async () => {
        if (!activeWorkspace) return;
        setLoadingChats(true);
        try {
            const [chatData, session] = await Promise.all([
                getConversations(activeWorkspace.id),
                getCachedSession()
            ]);
            // ConversationService.getUserConversations returns each row as
            // { otherUser, lastMessage } (singular), not { participants, messages }
            // arrays — filtering on the latter always dropped every conversation.
            setConversations(chatData.filter((c: any) => !!c.lastMessage));
            if (session?.user) {
                setCurrentUser(session.user);
            }
        } catch (error) {
            console.error("Failed to fetch chats:", error);
        } finally {
            setLoadingChats(false);
        }
    };

    const fetchMembers = async () => {
        if (!activeWorkspace) return;
        setLoadingMembers(true);
        try {
            const memberData = await getWorkspaceMembers(activeWorkspace.id);
            setMembers(memberData);
        } catch (error) {
            console.error("Failed to fetch members:", error);
        } finally {
            setLoadingMembers(false);
        }
    };

    useEffect(() => {
        fetchChats();
        fetchMembers();
    }, [activeWorkspace?.id]);

    useEffect(() => {
        const unsubscribe = navigation.addListener('focus', () => {
            fetchChats();
        });
        return unsubscribe;
    }, [navigation, activeWorkspace?.id]);

    useEffect(() => {
        const sub = DeviceEventEmitter.addListener("remote_update", () => {
            fetchChats();
        });
        return () => sub.remove();
    }, [activeWorkspace?.id]);

    const renderChat = ({ item }: { item: any }) => {
        // ConversationService.getUserConversations shapes each row as
        // { otherUser, lastMessage } — singular objects, not participant/message arrays.
        const otherParticipant = item.otherUser;
        if (!otherParticipant) return null;
        const participantName: string = otherParticipant.surname || otherParticipant.name || "Unknown";
        const participantInitial: string = participantName.charAt(0).toUpperCase();

        const lastMessage = item.lastMessage;
        const isMine = lastMessage?.senderId === currentUser?.id;
        // Driven by the message's own read receipt (same field the delivery
        // ticks in DirectChatScreen use) rather than the separate notifications
        // list — that depended on a matching notification existing at all,
        // which isn't guaranteed, so unread chats often never highlighted.
        const hasUnread = !!lastMessage && !isMine && !lastMessage.isRead;
        const otherRole = members.find(m => m.userId === otherParticipant.id)?.workspaceRole;

        return (
            <PressableScale
                haptic="selection"
                style={[
                    styles.chatCard,
                    { backgroundColor: colors.surfaceSolid, borderColor: colors.border },
                    hasUnread && { backgroundColor: colors.primary + "0F", borderColor: colors.primary + "40" },
                ]}
                onPress={() => {
                    navigation.navigate("DirectChat", {
                        otherUserId: otherParticipant.id,
                        otherUserName: otherParticipant.surname || otherParticipant.name,
                        otherUserRole: otherRole || "Member"
                    });
                }}
                accessibilityLabel={`Open conversation with ${participantName}`}
            >
                <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
                    {otherParticipant.image ? (
                        <Image source={{ uri: otherParticipant.image }} style={styles.avatarImage} />
                    ) : (
                        <Text style={styles.avatarText}>
                            {participantInitial}
                        </Text>
                    )}
                </View>

                <View style={styles.chatInfo}>
                    <View style={styles.chatHeader}>
                        <Text style={[styles.chatName, { color: colors.text }]} numberOfLines={1}>
                            {participantName}
                        </Text>
                        {lastMessage && (
                            <Text style={[styles.chatTime, { color: hasUnread ? colors.primary : colors.textDim }]}>
                                {isToday(new Date(lastMessage.createdAt))
                                    ? format(new Date(lastMessage.createdAt), 'h:mm a')
                                    : format(new Date(lastMessage.createdAt), 'MMM d')}
                            </Text>
                        )}
                    </View>
                    <View style={styles.chatSubRow}>
                        {otherRole && (
                            <StatusChip
                                label={otherRole}
                                kind={otherRole.toLowerCase() === "owner" || otherRole.toLowerCase() === "admin" ? "info" : "neutral"}
                                size="sm"
                                style={styles.roleChip}
                            />
                        )}
                        {lastMessage && (
                            <Text style={[styles.lastMessage, { color: hasUnread ? colors.primary : colors.textDim, fontFamily: hasUnread ? FONTS.semibold : FONTS.regular }]} numberOfLines={1}>
                                {isMine ? "You: " : ""}{lastMessage.content}
                            </Text>
                        )}
                    </View>
                </View>

                {hasUnread && (
                    <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />
                )}
            </PressableScale>
        );
    };

    const renderMember = ({ item }: { item: WorkspaceMember }) => {
        const isMe = item.userId === currentUser?.id || item.user.id === currentUser?.id;

        const memberDisplayName = item.user.surname || item.user.name;
        const isVerified = item.status === "Verified";

        return (
            <PressableScale
                haptic="selection"
                style={[styles.memberCard, { backgroundColor: colors.surfaceSolid, borderColor: colors.border }]}
                onPress={() => setMemberDetail(item)}
                accessibilityLabel={`View ${memberDisplayName}'s details`}
            >
                <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
                    {item.user.image ? (
                        <Image source={{ uri: item.user.image }} style={styles.avatarImage} />
                    ) : (
                        <Text style={styles.avatarText}>
                            {(item.user?.surname?.[0] || item.user?.name?.[0] || item.user?.email?.[0] || "?").toUpperCase()}
                        </Text>
                    )}
                </View>

                <View style={styles.memberInfo}>
                    <Text style={[styles.memberName, { color: colors.text }]} numberOfLines={1}>
                        {memberDisplayName} {isMe ? "(You)" : ""}
                    </Text>
                    {(item.designation || item.departmentName) && (
                        <Text style={[styles.memberSubtext, { color: colors.textDim }]} numberOfLines={1}>
                            {[item.designation, item.departmentName].filter(Boolean).join(" · ")}
                        </Text>
                    )}
                    <View style={styles.memberChipRow}>
                        <StatusChip
                            label={item.workspaceRole}
                            kind={item.workspaceRole.toLowerCase() === "owner" || item.workspaceRole.toLowerCase() === "admin" ? "info" : "neutral"}
                            size="sm"
                        />
                        {item.status && (
                            <StatusChip label={item.status} kind={isVerified ? "success" : "warning"} size="sm" />
                        )}
                        {canSeeWorkload && item.openTaskCount !== undefined && (
                            <View style={[styles.taskCountBadge, { backgroundColor: colors.surfaceHighlight }]}>
                                <Text style={[styles.taskCountText, { color: colors.textDim }]}>
                                    {item.openTaskCount} open
                                </Text>
                            </View>
                        )}
                    </View>
                </View>

                <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
            </PressableScale>
        );
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top"]}>
            <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />

            <View style={{ flex: 1, maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center' }}>
            <View style={[styles.header, { paddingHorizontal: value(16, SPACING.xl, SPACING.xxl) }]}>
                <PressableScale
                    onPress={() => navigation.goBack()}
                    style={styles.backBtn}
                    accessibilityLabel="Go back"
                >
                    <Ionicons name="chevron-back" size={24} color={colors.text} />
                </PressableScale>
                <Text style={[styles.headerTitle, { color: colors.text }]}>Team</Text>
                <View style={{ width: TOUCH_TARGET.min }} />
            </View>

            <View style={[styles.tabSwitcher, { backgroundColor: colors.surfaceHighlight, marginHorizontal: value(16, SPACING.xl, SPACING.xxl) }]}>
                {(["messages", "members"] as TeamTab[]).map((tab) => (
                    <PressableScale
                        key={tab}
                        haptic="selection"
                        style={[styles.tabItem, activeTab === tab && { backgroundColor: colors.surface }]}
                        onPress={() => setActiveTab(tab)}
                    >
                        <Text style={[styles.tabText, { color: activeTab === tab ? colors.text : colors.textDim }]}>
                            {tab === "messages" ? "Messages" : "Members"}
                        </Text>
                    </PressableScale>
                ))}
            </View>

            {activeTab === "messages" ? (
                loadingChats ? (
                    <ListSkeleton rows={7} />
                ) : (
                    <FlatList
                        data={conversations}
                        renderItem={renderChat}
                        keyExtractor={(item) => item.id}
                        contentContainerStyle={[styles.listContent, { paddingHorizontal: value(16, SPACING.xl, SPACING.xxl) }]}
                        ListEmptyComponent={
                            <EmptyState
                                icon="chatbubbles-outline"
                                title="No recent chats"
                                message="Start a conversation with a team member using the button below."
                            />
                        }
                    />
                )
            ) : (
                <>
                    <View style={[styles.searchContainer, { paddingHorizontal: value(16, SPACING.xl, SPACING.xxl) }]}>
                        <View style={[styles.searchBox, { backgroundColor: colors.surfaceSolid, borderColor: colors.border }]}>
                            <Ionicons name="search" size={18} color={colors.textDim} />
                            <TextInput
                                style={[styles.searchInput, { color: colors.text }]}
                                placeholder="Search team members..."
                                placeholderTextColor={colors.textDim}
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                                autoCapitalize="none"
                                autoCorrect={false}
                                clearButtonMode="while-editing"
                                accessibilityLabel="Search team members"
                            />
                        </View>
                    </View>

                    {loadingMembers ? (
                        <ListSkeleton rows={7} />
                    ) : (
                        <FlatList
                            data={filteredMembers}
                            renderItem={renderMember}
                            keyExtractor={(item) => item.id}
                            contentContainerStyle={[styles.listContent, { paddingHorizontal: value(16, SPACING.xl, SPACING.xxl) }]}
                            ListEmptyComponent={
                                <EmptyState
                                    icon="people-outline"
                                    title="No members found"
                                    message="Try a different search term."
                                />
                            }
                        />
                    )}
                </>
            )}

            {activeTab === "messages" && (
                <PressableScale
                    style={[
                        styles.fab,
                        {
                            backgroundColor: colors.primary,
                            bottom: 20,
                        }
                    ]}
                    haptic="light"
                    onPress={() => setActiveTab("members")}
                    accessibilityLabel="Start a new chat"
                    accessibilityHint="Switches to the Members tab to pick who to message"
                >
                    <Ionicons name="people" size={20} color="#fff" />
                    <Text style={styles.fabLabel}>New chat</Text>
                </PressableScale>
            )}

            <MemberDetailModal
                member={memberDetail}
                canSeeWorkload={canSeeWorkload}
                onClose={() => setMemberDetail(null)}
                onMessage={(member) => {
                    setMemberDetail(null);
                    navigation.navigate("DirectChat", {
                        otherUserId: member.userId,
                        otherUserName: member.user.surname || member.user.name,
                        otherUserRole: member.workspaceRole
                    });
                }}
            />
            </View>
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
    },
    backBtn: { width: TOUCH_TARGET.min, height: TOUCH_TARGET.min, justifyContent: "center" },
    headerTitle: { fontSize: 18, fontFamily: FONTS.bold },

    tabSwitcher: { flexDirection: "row", borderRadius: BORDER_RADIUS.md, padding: 3, marginBottom: SPACING.sm },
    tabItem: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: BORDER_RADIUS.sm },
    tabText: { fontSize: 13, fontFamily: FONTS.bold },

    center: { flex: 1, justifyContent: "center", alignItems: "center" },
    centerEmpty: { flex: 1, justifyContent: "center", alignItems: "center", marginTop: 80 },
    listContent: { padding: 16, paddingTop: 8, paddingBottom: 100, gap: 12 },

    searchContainer: {
        paddingHorizontal: 16,
        paddingBottom: 12,
    },
    searchBox: {
        flexDirection: "row",
        alignItems: "center",
        height: 48,
        borderRadius: BORDER_RADIUS.lg,
        borderWidth: 1,
        paddingHorizontal: 12,
        gap: 10,
    },
    searchInput: {
        flex: 1,
        fontSize: 15,
        height: "100%",
    },

    chatCard: {
        flexDirection: "row",
        alignItems: "center",
        padding: 12,
        borderRadius: BORDER_RADIUS.lg,
        borderWidth: 1,
    },
    avatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        justifyContent: "center",
        alignItems: "center",
    },
    avatarImage: { width: 48, height: 48, borderRadius: 24 },
    avatarText: { color: "#fff", fontSize: 18, fontFamily: FONTS.bold },

    chatInfo: { flex: 1, marginLeft: 12, justifyContent: "center" },
    chatHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 2,
    },
    chatName: { fontSize: 16, fontFamily: FONTS.bold, flex: 1 },
    chatTime: { fontSize: 11, fontFamily: FONTS.regular },
    chatSubRow: { flexDirection: "row", alignItems: "center", marginTop: 4, gap: 8 },
    roleChip: { marginTop: 0 },
    lastMessage: { fontSize: 13, flexShrink: 1 },
    unreadDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        marginLeft: 8,
    },

    memberCard: {
        flexDirection: "row",
        alignItems: "center",
        padding: 12,
        borderRadius: BORDER_RADIUS.lg,
        borderWidth: 1,
    },
    memberInfo: { flex: 1, marginLeft: 12, gap: 4 },
    memberName: { fontSize: 15, fontFamily: FONTS.semibold },
    memberSubtext: { fontSize: 12, fontFamily: FONTS.regular },
    memberChipRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, marginTop: 2 },
    taskCountBadge: { borderRadius: BORDER_RADIUS.full, paddingHorizontal: 8, paddingVertical: 3 },
    taskCountText: { fontSize: 11, fontFamily: FONTS.semibold },

    fab: {
        position: "absolute",
        right: 20,
        minHeight: 52,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        paddingHorizontal: 20,
        borderRadius: BORDER_RADIUS.full,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 10,
        elevation: 10,
        borderWidth: 1.5,
        borderColor: "rgba(255,255,255,0.2)",
    },
    fabLabel: { color: "#fff", fontSize: 15, fontFamily: FONTS.bold },
});

