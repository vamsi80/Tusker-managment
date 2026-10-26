import { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquarePlus, MessagesSquare } from "lucide-react-native";
import { conversationsApi } from "../../api/comms";
import { useAuth } from "../../providers/AuthProvider";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { qk } from "../../lib/query";
import { realtime, EVENTS } from "../../lib/realtime";
import { displayName, fmtRelativeDay, fmtTime } from "../../lib/format";
import { useTheme } from "../../theme/ThemeProvider";
import { fonts, radius } from "../../theme/tokens";
import { Avatar, EmptyState, ListSkeleton, SearchBar, Text } from "../../components/ui";
import { ScreenHeader } from "../../components/layout/Screen";

export const isOnline = (lastActiveAt?: string | null) => !!lastActiveAt && Date.now() - new Date(lastActiveAt).getTime() < 120_000;

/** /myspace/conversations — conversation-list.tsx. */
export function MessagesScreen({ embedded }: { embedded?: boolean } = {}) {
    const { colors, shadow } = useTheme();
    const navigation = useNavigation<any>();
    const qc = useQueryClient();
    const auth = useAuth();
    const myId = auth.status === "signedIn" ? auth.user.id : "";
    const { workspaceId } = useWorkspace();
    const [search, setSearch] = useState("");
    const q = useQuery({ queryKey: qk.conversations(workspaceId), queryFn: () => conversationsApi.list(workspaceId), enabled: !!workspaceId, refetchInterval: 60_000 });

    useEffect(() => {
        const off1 = realtime.subscribe(EVENTS.CONVERSATION_UPDATE, () => qc.invalidateQueries({ queryKey: qk.conversations(workspaceId) }));
        const off2 = realtime.subscribe(EVENTS.PRESENCE_UPDATE, (data) =>
            qc.setQueryData(qk.conversations(workspaceId), (old: any[] | undefined) =>
                old?.map((c) => (c.otherUser?.id === data.userId ? { ...c, otherUser: { ...c.otherUser, lastActiveAt: data.lastActiveAt } } : c)),
            ),
        );
        return () => {
            off1();
            off2();
        };
    }, [qc, workspaceId]);

    const list = useMemo(
        () => (q.data ?? []).filter((c: any) => !search.trim() || displayName(c.otherUser).toLowerCase().includes(search.trim().toLowerCase())),
        [q.data, search],
    );

    return (
        <View style={{ flex: 1, backgroundColor: colors.background }}>
            {embedded ? null : <ScreenHeader title="Messages" />}
            <FlatList
                data={list}
                keyExtractor={(c) => c.id}
                contentContainerStyle={{ padding: 16, gap: 4, paddingBottom: 100 }}
                refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={colors.primaryInk} />}
                ListHeaderComponent={<SearchBar value={search} onChangeText={setSearch} placeholder="Search conversations…" />}
                ListHeaderComponentStyle={{ marginBottom: 10 }}
                ListEmptyComponent={
                    q.isLoading ? (
                        <ListSkeleton rows={6} />
                    ) : (
                        <EmptyState icon={MessagesSquare} title="No conversations yet" description="Start a direct message with someone on your team." actionLabel="New message" onAction={() => navigation.navigate("NewChat")} />
                    )
                }
                renderItem={({ item: c }) => {
                    const last = c.lastMessage;
                    const unread = last && last.senderId !== myId && !last.isRead;
                    return (
                        <Pressable
                            onPress={() => navigation.navigate("Chat", { conversationId: c.id, name: displayName(c.otherUser), userId: c.otherUser?.id })}
                            style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.secondary : "transparent" }]}
                        >
                            <View>
                                <Avatar name={displayName(c.otherUser)} image={c.otherUser?.image} size={48} />
                                {isOnline(c.otherUser?.lastActiveAt) ? <View style={[styles.online, { borderColor: colors.background, backgroundColor: colors.success }]} /> : null}
                            </View>
                            <View style={{ flex: 1, gap: 3 }}>
                                <View style={{ flexDirection: "row", alignItems: "center" }}>
                                    <Text variant="title" numberOfLines={1} style={{ flex: 1, fontFamily: unread ? fonts.bold : fonts.semibold }}>
                                        {displayName(c.otherUser)}
                                    </Text>
                                    <Text variant="caption" tone={unread ? "primary" : "muted"}>
                                        {last ? (fmtRelativeDay(last.createdAt) === "Today" ? fmtTime(last.createdAt) : fmtRelativeDay(last.createdAt)) : ""}
                                    </Text>
                                </View>
                                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                                    <Text variant="small" tone={unread ? "default" : "muted"} numberOfLines={1} style={{ flex: 1 }}>
                                        {last ? `${last.senderId === myId ? "You: " : ""}${last.content}` : "No messages yet"}
                                    </Text>
                                    {unread ? <View style={[styles.dot, { backgroundColor: colors.primary }]} /> : null}
                                </View>
                            </View>
                        </Pressable>
                    );
                }}
            />
            <Pressable onPress={() => navigation.navigate("NewChat")} style={({ pressed }) => [styles.fab, shadow.lg, { backgroundColor: colors.primary, transform: [{ scale: pressed ? 0.94 : 1 }] }]}>
                <MessageSquarePlus size={24} color={colors.primaryForeground} />
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 10, borderRadius: radius.lg },
    online: { position: "absolute", right: 1, bottom: 1, width: 13, height: 13, borderRadius: 7, borderWidth: 2 },
    dot: { width: 9, height: 9, borderRadius: 5 },
    fab: { position: "absolute", right: 20, bottom: 20, width: 58, height: 58, borderRadius: 20, alignItems: "center", justifyContent: "center" },
});
