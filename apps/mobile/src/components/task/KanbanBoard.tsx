import { memo, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare } from "lucide-react-native";
import { Ionicons } from "@expo/vector-icons";
import { tasksApi, type Task } from "../../api/tasks";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { qk } from "../../lib/query";
import { realtime, EVENTS } from "../../lib/realtime";
import { statusColor, statusLabel } from "../../lib/constants";
import { useTheme } from "../../theme/ThemeProvider";
import { fonts, radius } from "../../theme/tokens";
import { Skeleton, Text, tint } from "../ui";
import { StatusPicker } from "./StatusPicker";
import { AssigneeAvatar, DelayPill, TagChips } from "./TaskBits";
import type { TaskFilterState } from "./TaskFilters";

const COLUMNS = ["TO_DO", "IN_PROGRESS", "REVIEW", "HOLD", "COMPLETED", "CANCELLED"] as const;
/** The old app's column glyphs (apps/mobile ProjectKanban.tsx). */
const COLUMN_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
    TO_DO: "list",
    IN_PROGRESS: "play-circle",
    REVIEW: "eye",
    HOLD: "pause-circle",
    COMPLETED: "checkmark-circle",
    CANCELLED: "close-circle",
};
type Column = { tasks: Task[]; totalCount: number; hasMore: boolean; nextCursor: any };

/**
 * components/task/kanban: one column per status (subtasks only), each loading
 * its own next page. Columns page horizontally; a card's status pill moves it
 * between columns with the same transition rules as the web drag.
 */
export function KanbanBoard({ projectId, filters, header }: { projectId?: string; filters: TaskFilterState; header?: React.ReactNode }) {
    const { colors } = useTheme();
    const { width } = useWindowDimensions();
    const qc = useQueryClient();
    const { workspaceId } = useWorkspace();
    const columnWidth = Math.min(320, width * 0.84);

    const params = {
        workspaceId,
        projectId: projectId ? [projectId] : filters.projectId ? [filters.projectId] : undefined,
        assigneeId: filters.assigneeId.length ? filters.assigneeId : undefined,
        tagId: filters.tagId.length ? filters.tagId : undefined,
        search: filters.search.trim() || undefined,
        dueAfter: filters.dueAfter,
        dueBefore: filters.dueBefore,
        pageSize: 15,
    };
    const board = useQuery({ queryKey: qk.kanban(workspaceId, params), queryFn: () => tasksApi.kanban(params), enabled: !!workspaceId });
    const [extra, setExtra] = useState<Record<string, Column>>({});

    useEffect(() => setExtra({}), [board.dataUpdatedAt]);
    useEffect(() => realtime.subscribe(EVENTS.TASK_UPDATE, () => qc.invalidateQueries({ queryKey: ["tasks", workspaceId, "kanban"] })), [qc, workspaceId]);

    const column = (status: string): Column => {
        const base: Column = board.data?.[status] ?? { tasks: [], totalCount: 0, hasMore: false, nextCursor: null };
        const more = extra[status];
        return more ? { ...more, totalCount: base.totalCount, tasks: [...base.tasks, ...more.tasks] } : base;
    };

    const loadMore = async (status: string) => {
        const current = extra[status] ?? board.data?.[status];
        if (!current?.hasMore) return;
        const page = await tasksApi.list({
            workspaceId,
            viewMode: "kanban",
            projectId: params.projectId,
            status: [status],
            assigneeId: params.assigneeId,
            tagId: params.tagId,
            search: params.search,
            dueAfter: params.dueAfter,
            dueBefore: params.dueBefore,
            cursor: current.nextCursor,
            limit: 15,
        });
        const tasks = page.tasks?.length ? page.tasks : ((page as any).tasksByStatus?.[status]?.tasks ?? []);
        setExtra((prev) => ({
            ...prev,
            [status]: { tasks: [...(prev[status]?.tasks ?? []), ...tasks], totalCount: 0, hasMore: page.hasMore, nextCursor: page.nextCursor },
        }));
    };

    return (
        <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingVertical: 16, gap: 12 }}
            refreshControl={<RefreshControl refreshing={board.isRefetching} onRefresh={() => board.refetch()} tintColor={colors.primaryInk} />}
        >
            {header ? <View style={{ paddingHorizontal: 16 }}>{header}</View> : null}
            <ScrollView horizontal snapToInterval={columnWidth + 12} decelerationRate="fast" showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}>
                {COLUMNS.map((status) => {
                    const col = column(status);
                    const color = statusColor(status);
                    return (
                        <View key={status} style={[styles.column, { width: columnWidth, backgroundColor: colors.card, borderColor: colors.border }]}>
                            <View style={styles.columnHead}>
                                <View style={[styles.headIcon, { backgroundColor: tint(color, 0.12) }]}>
                                    <Ionicons name={COLUMN_ICON[status]} size={14} color={color} />
                                </View>
                                <Text style={{ fontFamily: fonts.bold, fontSize: 16, flex: 1 }} numberOfLines={1}>
                                    {statusLabel(status)}
                                </Text>
                                <View style={[styles.count, { backgroundColor: tint(color, 0.12) }]}>
                                    <Text style={{ fontFamily: fonts.heading, fontSize: 11, color }}>{col.totalCount}</Text>
                                </View>
                            </View>
                            {board.isLoading ? (
                                <View style={{ gap: 8 }}>
                                    {[0, 1, 2].map((i) => (
                                        <Skeleton key={i} height={110} rounded={12} />
                                    ))}
                                </View>
                            ) : (
                                <FlatList
                                    data={col.tasks}
                                    keyExtractor={(t) => t.id}
                                    renderItem={({ item }) => <KanbanCard task={item} />}
                                    scrollEnabled={false}
                                    contentContainerStyle={{ gap: 8 }}
                                    ListEmptyComponent={
                                        <View style={[styles.empty, { borderColor: colors.border }]}>
                                            <Ionicons name="document-text-outline" size={24} color={colors.mutedForeground} style={{ marginBottom: 6 }} />
                                            <Text variant="small" tone="muted">
                                                No tasks
                                            </Text>
                                        </View>
                                    }
                                    ListFooterComponent={col.hasMore ? <LoadMore onPress={() => loadMore(status)} /> : null}
                                />
                            )}
                        </View>
                    );
                })}
            </ScrollView>
        </ScrollView>
    );
}

function LoadMore({ onPress }: { onPress: () => Promise<void> }) {
    const { colors } = useTheme();
    const [busy, setBusy] = useState(false);
    return (
        <Pressable
            onPress={async () => {
                setBusy(true);
                await onPress().finally(() => setBusy(false));
            }}
            style={[styles.more, { borderColor: colors.border }]}
        >
            {busy ? <ActivityIndicator size="small" color={colors.primaryInk} /> : <Text variant="label" tone="muted">Load more</Text>}
        </Pressable>
    );
}

/** kanban-card.tsx: project · parent header, name, status, comments, deadline, tags, assignee. */
export const KanbanCard = memo(function KanbanCard({ task }: { task: Task }) {
    const { colors, shadow } = useTheme();
    const navigation = useNavigation<any>();
    const comments = task._count?.Activity ?? task.activityCount ?? task.commentCount ?? 0;
    return (
        <Pressable
            onPress={() => navigation.navigate("TaskDetail", { taskId: task.id, title: task.name })}
            style={({ pressed }) => [
                styles.card,
                shadow.sm,
                { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: statusColor(task.status ?? "TO_DO"), transform: [{ scale: pressed ? 0.985 : 1 }] },
            ]}
        >
            <View style={styles.cardHead}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: task.project?.color || colors.primary }} />
                <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: fonts.bold, fontSize: 10, letterSpacing: 0.3, textTransform: "uppercase", color: colors.mutedForeground }}>
                    {task.project?.name ?? "No Project"}
                    {task.parentTask?.name ? <Text style={{ fontFamily: fonts.medium, fontSize: 10, color: colors.mutedForeground }}> / {task.parentTask.name}</Text> : null}
                </Text>
            </View>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20, color: colors.foreground }} numberOfLines={3}>
                {task.name}
            </Text>
            <StatusPicker task={task} size="xs" />
            <View style={[styles.cardFoot, { borderTopColor: colors.border }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <MessageSquare size={13} color={colors.mutedForeground} />
                    <Text variant="caption" tone="muted">
                        {comments}
                    </Text>
                </View>
                <DelayPill dueDate={task.dueDate} status={task.status} />
                <View style={{ flex: 1 }}>
                    <TagChips tags={task.tags} />
                </View>
                <AssigneeAvatar user={task.assignee} size={24} />
            </View>
        </Pressable>
    );
});

const styles = StyleSheet.create({
    // apps/mobile ProjectKanban.tsx: bordered column, round status glyph, count pill.
    column: { borderRadius: radius.lg, borderWidth: 1, padding: 8, gap: 8, alignSelf: "flex-start" },
    columnHead: { flexDirection: "row", alignItems: "center", gap: 8, padding: 8 },
    headIcon: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
    count: { minWidth: 26, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, alignItems: "center", justifyContent: "center" },
    // A thick status-coloured left edge, as on the old app's cards.
    card: { borderRadius: radius.md, borderWidth: 1, borderLeftWidth: 4, padding: 14, gap: 9 },
    cardHead: { flexDirection: "row", alignItems: "center", gap: 6 },
    cardFoot: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 8, borderTopWidth: 1 },
    empty: { borderWidth: 1, borderStyle: "dashed", borderRadius: radius.md, paddingVertical: 24, alignItems: "center", opacity: 0.6 },
    more: { borderWidth: 1, borderStyle: "dashed", borderRadius: radius.md, paddingVertical: 10, alignItems: "center", marginTop: 4 },
});
