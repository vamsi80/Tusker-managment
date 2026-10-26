import { useMemo, useState, type ReactNode } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { Bell, CheckCheck, MessageSquare } from "lucide-react-native";
import { notificationsApi, type NotificationGroup } from "../../api/comms";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { qk } from "../../lib/query";
import { toast } from "../../lib/toast";
import { timeAgo } from "../../lib/format";
import { useTheme } from "../../theme/ThemeProvider";
import { fonts } from "../../theme/tokens";
import { Avatar, Chip, EmptyState, ListSkeleton, SearchBar, Text, tint } from "../../components/ui";
import { Screen, ScreenHeader } from "../../components/layout/Screen";

type Page = Awaited<ReturnType<typeof notificationsApi.list>>;
type Tab = "new" | "history";

const titleCase = (s?: string | null) => (s ?? "").replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
const QUOTED = new Set(["comment", "activity", "DM_MESSAGE"]);

/** /w/[workspaceId]/notifications — notification-list.tsx: New / History, search, mark all read. */
export function NotificationsScreen({ embedded }: { embedded?: boolean }) {
    const navigation = useNavigation<any>();
    const { colors } = useTheme();
    const qc = useQueryClient();
    const { workspaceId } = useWorkspace();
    const [tab, setTab] = useState<Tab>("new");
    const [search, setSearch] = useState("");
    const key = qk.notifications(workspaceId);

    const q = useInfiniteQuery({
        queryKey: key,
        enabled: !!workspaceId,
        initialPageParam: null as string | null,
        queryFn: ({ pageParam }) => notificationsApi.list(workspaceId, pageParam),
        getNextPageParam: (last) => (last.hasMore ? last.nextCursor : undefined),
    });

    // Pages overlap at the cursor edge; keep the first copy of each group, as the web does.
    const { unread, read } = useMemo(() => {
        const seen = new Set<string>();
        const unread: NotificationGroup[] = [];
        const read: NotificationGroup[] = [];
        for (const page of q.data?.pages ?? []) {
            for (const n of page.unreadNotifications) if (!seen.has(n.id ?? n.taskId)) (seen.add(n.id ?? n.taskId), unread.push(n));
            for (const n of page.readNotifications) if (!seen.has(n.id ?? n.taskId)) (seen.add(n.id ?? n.taskId), read.push(n));
        }
        return { unread, read };
    }, [q.data]);

    const filter = (list: NotificationGroup[]) => {
        const s = search.trim().toLowerCase();
        if (!s) return list;
        return list.filter((n) =>
            [n.taskName, n.projectName, n.parentTaskName, n.latestComment?.user?.surname, n.latestComment?.content].some((v) => (v ?? "").toLowerCase().includes(s)),
        );
    };
    const list = filter(tab === "new" ? unread : read);

    const markLocal = (match: (n: NotificationGroup) => boolean) =>
        qc.setQueryData<InfiniteData<Page>>(key, (old) =>
            old
                ? {
                      ...old,
                      pages: old.pages.map((p) => {
                          const moved = p.unreadNotifications.filter(match).map((n) => ({ ...n, isNew: false }));
                          return { ...p, unreadNotifications: p.unreadNotifications.filter((n) => !match(n)), readNotifications: [...moved, ...p.readNotifications] };
                      }),
                  }
                : old,
        );

    const markAll = async () => {
        markLocal(() => true);
        try {
            await notificationsApi.markAllRead(workspaceId);
            toast.success("All notifications marked as read");
        } catch {
            toast.error("Failed to mark all as read");
        }
        qc.invalidateQueries({ queryKey: qk.layout(workspaceId) });
    };

    const open = (n: NotificationGroup) => {
        const target = n.id || n.taskId;
        if (n.isNew) {
            markLocal((x) => (x.id || x.taskId) === target);
            notificationsApi
                .markRead(target)
                .then(() => qc.invalidateQueries({ queryKey: qk.layout(workspaceId) }))
                .catch(() => {});
        }
        const entity = String(n.entityType ?? "").toUpperCase();
        if (n.type === "DM_MESSAGE" || entity === "CONVERSATION") {
            const conversationId = n.conversationId ?? n.entityId;
            if (conversationId) navigation.navigate("Chat", { conversationId, name: n.latestComment?.user?.name });
        } else if (entity === "INDENT" && n.entityId) navigation.navigate("IndentDetail", { indentId: n.entityId });
        else if (entity === "POINTSENTRY") navigation.navigate("Team", { tab: "points" });
        else if (entity === "LEAVE_REQUEST") navigation.navigate("Team", { tab: "leaves" });
        else if (entity === "ATTENDANCE") navigation.navigate("Team", { tab: "attendance" });
        else if (entity === "MEMBER") navigation.navigate("Team", { tab: "members" });
        else if (entity === "MEETING") navigation.navigate("Calendar");
        else if (!entity || entity === "TASK" || entity === "SUBTASK") navigation.navigate("TaskDetail", { taskId: n.taskId, title: n.taskName });
    };

    const unreadCount = q.data?.pages[0]?.peopleCount ?? unread.length;
    const markAllButton =
        unread.length > 0 ? (
            <Pressable hitSlop={8} onPress={markAll} style={({ pressed }) => [styles.markAll, { backgroundColor: pressed ? colors.secondary : "transparent" }]}>
                <CheckCheck size={16} color={colors.primaryInk} />
                <Text variant="label" tone="primary">
                    Mark all read
                </Text>
            </Pressable>
        ) : null;

    return (
        <Shell embedded={embedded}>
            {embedded ? null : <ScreenHeader title="Notifications" showActions={false} right={markAllButton} />}
            <FlatList
                data={list}
                keyExtractor={(n, i) => `${n.id || n.taskId}-${n.type}-${i}`}
                contentContainerStyle={{ paddingBottom: 48 }}
                refreshControl={<RefreshControl refreshing={q.isRefetching && !q.isFetchingNextPage} onRefresh={() => q.refetch()} tintColor={colors.primaryInk} />}
                ListHeaderComponent={
                    <View style={{ padding: 16, paddingBottom: 8, gap: 12 }}>
                        <SearchBar value={search} onChangeText={setSearch} placeholder="Search notifications..." />
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                            <Chip label={unreadCount ? `New · ${unreadCount}` : "New"} active={tab === "new"} onPress={() => setTab("new")} />
                            <Chip label="History" active={tab === "history"} onPress={() => setTab("history")} />
                            <View style={{ flex: 1 }} />
                            {embedded ? markAllButton : null}
                        </View>
                    </View>
                }
                ListEmptyComponent={
                    q.isLoading ? (
                        <View style={{ padding: 16 }}>
                            <ListSkeleton rows={6} />
                        </View>
                    ) : tab === "new" ? (
                        <EmptyState icon={MessageSquare} title="All caught up!" description="No unread notifications" />
                    ) : (
                        <EmptyState icon={Bell} title="No history" description="Recently read notifications appear here" />
                    )
                }
                onEndReachedThreshold={0.4}
                onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage()}
                ListFooterComponent={q.isFetchingNextPage ? <ActivityIndicator color={colors.primaryInk} style={{ margin: 16 }} /> : null}
                renderItem={({ item }) => <NotificationRow notif={item} onPress={() => open(item)} />}
            />
        </Shell>
    );
}

/** Full screen on its own; a bare panel inside the Inbox tab. */
function Shell({ embedded, children }: { embedded?: boolean; children: ReactNode }) {
    return embedded ? <View style={{ flex: 1 }}>{children}</View> : <Screen>{children}</Screen>;
}

/** notification-list-item.tsx — breadcrumb, actor, snippet, time. */
function NotificationRow({ notif, onPress }: { notif: NotificationGroup; onPress: () => void }) {
    const { colors } = useTheme();
    const comment = notif.latestComment ?? ({} as NotificationGroup["latestComment"]);
    const actor = comment.user?.surname || comment.user?.name || "Someone";
    const quoted = QUOTED.has(notif.type);
    return (
        <Pressable onPress={onPress} style={({ pressed }) => [styles.row, { borderBottomColor: colors.border, backgroundColor: pressed ? colors.secondary : "transparent" }]}>
            <Avatar name={actor} image={comment.user?.image} size={38} />
            <View style={{ flex: 1, gap: 3 }}>
                <Text numberOfLines={1} style={{ fontFamily: fonts.medium, fontSize: 10, letterSpacing: 0.6, textTransform: "uppercase", color: colors.mutedForeground }}>
                    {titleCase(notif.projectName)}
                    {notif.parentTaskName ? ` / ${titleCase(notif.parentTaskName)}` : ""}
                    {" / "}
                    <Text style={{ fontFamily: fonts.semibold, fontSize: 10, color: colors.foreground }}>{titleCase(notif.taskName)}</Text>
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={{ fontFamily: notif.isNew ? fonts.bold : fonts.semibold, fontSize: 14, color: colors.foreground }} numberOfLines={1}>
                        {actor}
                    </Text>
                    {notif.count > 1 ? (
                        <View style={[styles.more, { backgroundColor: tint(colors.primary, 0.14) }]}>
                            <Text style={{ fontFamily: fonts.bold, fontSize: 10, color: colors.primaryInk }}>+{notif.count - 1} more</Text>
                        </View>
                    ) : null}
                </View>
                {notif.parentTaskName ? (
                    <Text variant="caption" tone="muted" numberOfLines={1}>
                        Parent Task: <Text style={{ fontFamily: fonts.semibold, fontSize: 11, color: colors.mutedForeground }}>{titleCase(notif.parentTaskName)}</Text>
                    </Text>
                ) : null}
                <Text variant="small" tone={notif.isNew ? "default" : "muted"} numberOfLines={2} style={quoted ? { fontStyle: "italic" } : undefined}>
                    {quoted ? `"${comment.content ?? ""}"` : comment.content}
                </Text>
                <Text variant="caption" tone="muted" style={{ opacity: 0.7 }}>
                    {timeAgo(comment.createdAt)}
                </Text>
            </View>
            {notif.isNew ? <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} /> : null}
        </Pressable>
    );
}

const styles = StyleSheet.create({
    markAll: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, height: 34, borderRadius: 10 },
    row: { flexDirection: "row", gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, overflow: "hidden" },
    unreadDot: { width: 9, height: 9, borderRadius: 5, alignSelf: "center" },
    more: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999 },
});
