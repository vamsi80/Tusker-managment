import { useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownWideNarrow, ArrowUpNarrowWide, BarChart3, ChevronRight, ClipboardCheck, FileCheck2, Loader2 } from "lucide-react-native";
import { tasksApi } from "../../../api/tasks";
import { workspacesApi } from "../../../api/workspaces";
import { useWorkspace } from "../../../providers/WorkspaceProvider";
import { qk } from "../../../lib/query";
import { realtime, EVENTS } from "../../../lib/realtime";
import { displayName, fmtDate, toDateOnlyString } from "../../../lib/format";
import { useTheme } from "../../../theme/ThemeProvider";
import { Badge, EmptyState, Skeleton, StatusBadge, Text } from "../../../components/ui";
import { PillSwitch, WidgetCard, WidgetRow } from "./WidgetCard";

const ACTIVE_STATUSES = ["TO_DO", "IN_PROGRESS", "REVIEW"];
export type TaskRange = "delayed" | "today" | "week";
type Range = TaskRange;
/** Rows the Home card shows before "See all". */
const PREVIEW = 3;

const midnight = (offsetDays = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
};

/** rangeParams in my-tasks-widget.tsx: each tab is its own server query. */
const rangeParams = (range: Range) =>
    range === "delayed" ? { dueBefore: midnight(-1) } : range === "today" ? { dueAfter: midnight(0), dueBefore: midnight(0) } : { dueAfter: midnight(0), dueBefore: midnight(6) };

/** Home's All Tasks / My Tasks card: the first 3 tasks, then See all. */
export function MyTasksWidget() {
    const { role } = useWorkspace();
    const [range, setRange] = useState<Range>("today");
    return (
        <WidgetCard title={role === "OWNER" ? "All Tasks" : "My Tasks"} icon={FileCheck2} meta={rangeMeta(range)}>
            <MyTasksList range={range} onRangeChange={setRange} preview />
        </WidgetCard>
    );
}

export const rangeMeta = (range: Range) => (range === "delayed" ? "Past due" : range === "today" ? "Due today" : "Due in next 7 days");

/**
 * my-tasks-widget.tsx's list: Delayed / Today / Week tabs (each its own server
 * query), active tasks only. `preview` stops at 3 rows with a See all button.
 */
export function MyTasksList({ range, onRangeChange: setRange, preview }: { range: Range; onRangeChange: (r: Range) => void; preview?: boolean }) {
    const { colors } = useTheme();
    const navigation = useNavigation<any>();
    const qc = useQueryClient();
    const { workspaceId, layout } = useWorkspace();
    const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
    const direction = range === "delayed" ? sortDir : "asc";

    const params = { range, direction };
    const query = useInfiniteQuery({
        queryKey: qk.tasks(workspaceId, { widget: "my-tasks", ...params }),
        initialPageParam: null as any,
        queryFn: ({ pageParam }) =>
            tasksApi.list({
                workspaceId,
                viewMode: "list",
                limit: 10,
                includeSubTasks: false,
                own: true,
                status: ACTIVE_STATUSES,
                sorts: [{ field: "dueDate", direction }],
                cursor: pageParam,
                ...rangeParams(range),
            }),
        getNextPageParam: (last) => (last.hasMore ? last.nextCursor : undefined),
        enabled: !!workspaceId,
    });

    useEffect(
        () =>
            realtime.subscribe(EVENTS.TASK_UPDATE, () => {
                qc.invalidateQueries({ queryKey: ["tasks", workspaceId] });
            }),
        [qc, workspaceId],
    );

    const tasks = (query.data?.pages ?? []).flatMap((p) => p.tasks).filter((t) => !t.status || ACTIVE_STATUSES.includes(t.status));
    const projectNames = useMemo(() => new Map((layout?.projects ?? []).map((p) => [p.id, p.name])), [layout?.projects]);
    const emptyText = range === "delayed" ? "Nothing overdue" : range === "today" ? "No tasks due today" : "No tasks due in the next 7 days";
    const todayKey = toDateOnlyString(new Date());

    const shown = preview ? tasks.slice(0, PREVIEW) : tasks;
    const more = tasks.length > PREVIEW || query.hasNextPage;

    return (
        <View style={{ gap: 14 }}>
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                <View style={{ flex: 1 }}>
                    <PillSwitch
                        value={range}
                        onChange={setRange}
                        items={[
                            { key: "delayed", label: "Delayed" },
                            { key: "today", label: "Today" },
                            { key: "week", label: "Week" },
                        ]}
                    />
                </View>
                {range === "delayed" ? (
                    <Pressable onPress={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))} style={{ padding: 9, borderRadius: 999, backgroundColor: colors.muted }}>
                        {sortDir === "asc" ? <ArrowUpNarrowWide size={15} color={colors.mutedForeground} /> : <ArrowDownWideNarrow size={15} color={colors.mutedForeground} />}
                    </Pressable>
                ) : null}
            </View>
            {query.isLoading ? (
                <View style={{ gap: 8 }}>
                    {[0, 1, 2].map((i) => (
                        <Skeleton key={i} height={52} rounded={999} />
                    ))}
                </View>
            ) : tasks.length === 0 ? (
                <EmptyState icon={FileCheck2} title={emptyText} description="You're all caught up!" compact />
            ) : (
                <View style={{ gap: 8 }}>
                    {shown.map((task) => {
                        const due = task.dueDate ? toDateOnlyString(new Date(task.dueDate)) : null;
                        const overdue = due ? due < todayKey : false;
                        return (
                            <WidgetRow key={task.id} onPress={() => navigation.navigate("TaskDetail", { taskId: task.id, title: task.name })}>
                                <View style={{ flex: 1, gap: 5 }}>
                                    <Text variant="bodyMedium" numberOfLines={1}>
                                        {task.name}
                                    </Text>
                                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                        <StatusBadge status={task.status} size="xs" />
                                        {task.dueDate ? <Badge size="xs" label={fmtDate(task.dueDate, "MMM d")} color={overdue ? colors.destructive : undefined} variant={overdue ? "soft" : "outline"} /> : null}
                                        {task.projectId && projectNames.get(task.projectId) ? (
                                            <Text variant="caption" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
                                                {projectNames.get(task.projectId)}
                                            </Text>
                                        ) : null}
                                    </View>
                                </View>
                            </WidgetRow>
                        );
                    })}
                    {preview && more ? (
                        <Pressable
                            onPress={() => navigation.navigate("MyTasks", { range })}
                            accessibilityRole="button"
                            style={({ pressed }) => ({
                                borderRadius: 999,
                                borderWidth: 1,
                                borderColor: colors.border,
                                backgroundColor: pressed ? colors.secondary : "transparent",
                                paddingVertical: 11,
                                alignItems: "center",
                                flexDirection: "row",
                                justifyContent: "center",
                                gap: 4,
                            })}
                        >
                            <Text variant="label" tone="primary" style={{ fontSize: 13.5 }}>
                                See all ({query.hasNextPage ? `${tasks.length}+` : tasks.length})
                            </Text>
                            <ChevronRight size={16} color={colors.primaryInk} />
                        </Pressable>
                    ) : null}
                    {!preview && query.hasNextPage ? (
                        <Pressable
                            onPress={() => query.fetchNextPage()}
                            style={{ borderRadius: 999, borderWidth: 1, borderStyle: "dashed", borderColor: colors.border, paddingVertical: 10, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 6 }}
                        >
                            {query.isFetchingNextPage ? <Loader2 size={13} color={colors.mutedForeground} /> : null}
                            <Text variant="label" tone="muted">
                                Load more
                            </Text>
                        </Pressable>
                    ) : null}
                </View>
            )}
        </View>
    );
}

/** ReviewsWidget: REVIEW tasks where I am the named reviewer. */
export function ReviewsWidget() {
    const navigation = useNavigation<any>();
    const qc = useQueryClient();
    const { workspaceId } = useWorkspace();
    const query = useQuery({ queryKey: qk.reviews(workspaceId), queryFn: () => tasksApi.pendingReviews(workspaceId), enabled: !!workspaceId });
    useEffect(() => realtime.subscribe(EVENTS.TASK_UPDATE, () => qc.invalidateQueries({ queryKey: qk.reviews(workspaceId) })), [qc, workspaceId]);
    const items = query.data ?? [];

    return (
        <WidgetCard title="My Reviews" icon={ClipboardCheck} meta={items.length ? `${items.length} waiting` : "Waiting on you"}>
            {query.isLoading ? (
                <Skeleton height={48} rounded={999} />
            ) : items.length === 0 ? (
                <EmptyState icon={ClipboardCheck} title="No reviews pending" description="Tasks sent to you for review show here." compact />
            ) : (
                <View style={{ gap: 8 }}>
                    {items.map((item: any) => {
                        const meta = [item.project?.name, item.parentTask ? `Subtask of "${item.parentTask.name}"` : null].filter(Boolean).join(" · ");
                        return (
                            <WidgetRow key={item.id} onPress={() => navigation.navigate("TaskDetail", { taskId: item.id, title: item.name })}>
                                <View style={{ flex: 1, gap: 3 }}>
                                    <Text variant="bodyMedium" numberOfLines={1}>
                                        {item.name}
                                    </Text>
                                    <Text variant="caption" tone="muted" numberOfLines={1}>
                                        {meta}
                                    </Text>
                                </View>
                                {item.dueDate ? (
                                    <Text variant="caption" tone="muted">
                                        {fmtDate(item.dueDate, "MMM d")}
                                    </Text>
                                ) : null}
                            </WidgetRow>
                        );
                    })}
                </View>
            )}
        </WidgetCard>
    );
}

/** WorkloadWidget: open tasks per member, busiest first (owners, admins, managers). */
/** Open tasks per member, busiest first: the top 3, then View team for everyone. */
export function WorkloadWidget() {
    const navigation = useNavigation<any>();
    const { colors } = useTheme();
    const { workspaceId } = useWorkspace();
    const query = useQuery({
        queryKey: qk.members(workspaceId, "workload"),
        queryFn: () => workspacesApi.members(workspaceId, { page: 1, limit: 500 }),
        enabled: !!workspaceId,
    });
    const members = [...(query.data?.workspaceMembers ?? [])].sort((a, b) => (b.openTaskCount ?? 0) - (a.openTaskCount ?? 0));

    return (
        <WidgetCard title="Workload" icon={BarChart3} meta="View team" onMetaPress={() => navigation.navigate("Team")}>
            {query.isLoading ? (
                <Skeleton height={44} rounded={999} />
            ) : members.length === 0 ? (
                <EmptyState icon={BarChart3} title="No members yet" description="Open tasks per member show here." compact />
            ) : (
                <View style={{ gap: 8 }}>
                    {members.slice(0, PREVIEW).map((m) => {
                        const count = m.openTaskCount ?? 0;
                        const tone = count === 0 ? undefined : count < 5 ? colors.success : count < 10 ? colors.warning : colors.destructive;
                        return (
                            <WidgetRow
                                key={m.id}
                                onPress={() =>
                                    navigation.navigate("Tasks", {
                                        view: "list",
                                        assigneeId: m.userId,
                                        assigneeName: displayName(m),
                                        // The same statuses openTaskCount counts.
                                        status: ACTIVE_STATUSES,
                                    })
                                }
                            >
                                <View style={{ flex: 1 }}>
                                    <Text variant="bodyMedium" numberOfLines={1}>
                                        {displayName(m)}
                                    </Text>
                                    {m.designation || m.departmentName ? (
                                        <Text variant="caption" tone="muted" numberOfLines={1}>
                                            {[m.designation, m.departmentName].filter(Boolean).join(" · ")}
                                        </Text>
                                    ) : null}
                                </View>
                                <Badge label={`${count} ${count === 1 ? "task" : "tasks"}`} color={tone} variant={tone ? "soft" : "muted"} />
                            </WidgetRow>
                        );
                    })}
                    {members.length > PREVIEW ? (
                        <Pressable
                            onPress={() => navigation.navigate("Team")}
                            accessibilityRole="button"
                            style={({ pressed }) => ({
                                borderRadius: 999,
                                borderWidth: 1,
                                borderColor: colors.border,
                                backgroundColor: pressed ? colors.secondary : "transparent",
                                paddingVertical: 11,
                                alignItems: "center",
                                flexDirection: "row",
                                justifyContent: "center",
                                gap: 4,
                            })}
                        >
                            <Text variant="label" tone="primary" style={{ fontSize: 13.5 }}>
                                View team ({members.length})
                            </Text>
                            <ChevronRight size={16} color={colors.primaryInk} />
                        </Pressable>
                    ) : null}
                </View>
            )}
        </WidgetCard>
    );
}
