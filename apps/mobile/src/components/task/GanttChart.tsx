import { memo, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useInfiniteQuery, useQueries, useQueryClient } from "@tanstack/react-query";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import * as Haptics from "expo-haptics";
import { addDays, differenceInCalendarDays, format, isWeekend, startOfDay } from "date-fns";
import { ChevronDown, ChevronRight, GanttChartSquare } from "lucide-react-native";
import { dependencyIds, tasksApi, type Task } from "../../api/tasks";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { useProjectAccess } from "../../hooks/useProjectAccess";
import { qk } from "../../lib/query";
import { statusColor } from "../../lib/constants";
import { toDate } from "../../lib/format";
import { canEditTask } from "../../lib/taskRules";
import { toast } from "../../lib/toast";
import { useTheme } from "../../theme/ThemeProvider";
import { fonts, radius } from "../../theme/tokens";
import { EmptyState, Tabs, Text, tint } from "../ui";
import type { TaskFilterState } from "./TaskFilters";

type Zoom = "day" | "week" | "month";
const DAY_WIDTH: Record<Zoom, number> = { day: 38, week: 16, month: 6 };
const ROW_H = 44;
const LEFT_W = 150;
const HEADER_H = 46;

/** utils.ts formatDateForAPI: end-of-day for an end at midnight; sent as an exact instant (see TaskFormSheet). */
const forApi = (d: Date, type: "start" | "end") => {
    const x = new Date(d);
    if (type === "end" && x.getHours() === 0 && x.getMinutes() === 0) x.setHours(23, 59);
    return x.toISOString();
};

/** gantt/utils.ts subtaskProgress / parentProgress. */
function subtaskProgress(t: Task) {
    switch (t.status) {
        case "COMPLETED":
            return 100;
        case "REVIEW":
            return 80;
        case "IN_PROGRESS": {
            const s = toDate(t.startDate);
            const e = toDate(t.dueDate);
            if (!s || !e) return 10;
            const total = e.getTime() - s.getTime();
            if (total <= 0) return 60;
            return Math.min(60, Math.round(Math.max(0, ((startOfDay(new Date()).getTime() - s.getTime()) / total) * 60)));
        }
        default:
            return 0;
    }
}
function parentProgress(counts: Record<string, number> | undefined) {
    if (!counts) return 0;
    const total = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0) - (counts.CANCELLED ?? 0);
    return total > 0 ? Math.round(((counts.COMPLETED ?? 0) / total) * 100) : 0;
}
function aggregateStatus(counts: Record<string, number> | undefined) {
    if (!counts) return "TO_DO";
    const n = (s: string) => counts[s] ?? 0;
    const total = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);
    if (total === 0) return "TO_DO";
    if (n("COMPLETED") === total) return "COMPLETED";
    if (n("IN_PROGRESS") > 0 || n("REVIEW") > 0) return "IN_PROGRESS";
    if (n("COMPLETED") > 0 && n("TO_DO") > 0) return "IN_PROGRESS";
    if (n("HOLD") > 0) return "HOLD";
    if (n("CANCELLED") === total) return "CANCELLED";
    return "TO_DO";
}

type Row = { kind: "project"; id: string; name: string; color?: string } | { kind: "parent"; task: Task; start: Date | null; end: Date | null } | { kind: "sub"; task: Task; start: Date | null; end: Date | null };

export function GanttChart({ projectId, filters, header }: { projectId?: string; filters: TaskFilterState; header?: React.ReactNode }) {
    const { colors } = useTheme();
    const qc = useQueryClient();
    const { workspaceId, layout } = useWorkspace();
    const [zoom, setZoom] = useState<Zoom>("week");
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const dayW = DAY_WIDTH[zoom];

    const filterParams = {
        status: filters.status.length ? filters.status : undefined,
        assigneeId: filters.assigneeId.length ? filters.assigneeId : undefined,
        tagId: filters.tagId.length ? filters.tagId : undefined,
        search: filters.search.trim() || undefined,
    };
    const listParams = {
        workspaceId,
        projectId: projectId ?? filters.projectId,
        viewMode: "gantt" as const,
        hierarchyMode: "parents" as const,
        includeSubTasks: false,
        limit: 40,
        dueAfter: filters.dueAfter,
        dueBefore: filters.dueBefore,
        ...filterParams,
    };
    const parents = useInfiniteQuery({
        queryKey: qk.tasks(workspaceId, { gantt: listParams }),
        initialPageParam: null as any,
        queryFn: ({ pageParam }) => tasksApi.list({ ...listParams, cursor: pageParam }),
        getNextPageParam: (last) => (last.hasMore ? last.nextCursor : undefined),
        enabled: !!workspaceId,
    });
    const parentTasks = useMemo(() => (parents.data?.pages ?? []).flatMap((p) => p.tasks), [parents.data]);
    const expandedIds = parentTasks.filter((t) => expanded.has(t.id)).map((t) => t.id);

    const subQueries = useQueries({
        queries: expandedIds.map((id) => {
            const parent = parentTasks.find((t) => t.id === id)!;
            return {
                queryKey: qk.subtasks(id, { gantt: true, ...filterParams }),
                queryFn: () => tasksApi.subtasks(id, { workspaceId, projectId: parent.projectId, viewMode: "gantt", pageSize: 100, ...filterParams }),
            };
        }),
    });
    const subtasksByParent = new Map<string, Task[]>();
    expandedIds.forEach((id, i) => subtasksByParent.set(id, subQueries[i]?.data?.subTasks ?? []));

    const rows: Row[] = useMemo(() => {
        const out: Row[] = [];
        let lastProject: string | null = null;
        for (const p of parentTasks) {
            if (!projectId && p.projectId !== lastProject) {
                // The list payload's project is only { id, createdAt }; names come from the sidebar's list.
                const project: any = layout?.projects?.find((x) => x.id === p.projectId) ?? p.project;
                out.push({ kind: "project", id: p.projectId, name: project?.name ?? "Unknown Project", color: project?.color });
                lastProject = p.projectId;
            }
            const subs = subtasksByParent.get(p.id) ?? [];
            const subStarts = subs.map((s) => toDate(s.startDate)).filter(Boolean) as Date[];
            const subEnds = subs.map((s) => toDate(s.dueDate)).filter(Boolean) as Date[];
            const start = toDate(p.startDate) ?? (subStarts.length ? new Date(Math.min(...subStarts.map(Number))) : null);
            const end = toDate(p.dueDate) ?? (subEnds.length ? new Date(Math.max(...subEnds.map(Number))) : null);
            out.push({ kind: "parent", task: p, start, end });
            if (expanded.has(p.id)) {
                for (const s of [...subs].sort((a, b) => (a.position ?? 1000) - (b.position ?? 1000))) {
                    const sStart = toDate(s.startDate);
                    const sEnd = toDate(s.dueDate) ?? (sStart && s.days ? addDays(sStart, s.days) : null);
                    out.push({ kind: "sub", task: { ...s, projectId: s.projectId ?? p.projectId }, start: sStart ?? (sEnd ? addDays(sEnd, -(s.days ?? 1)) : null), end: sEnd });
                }
            }
        }
        return out;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [parentTasks, expanded, subQueries.map((q) => q.dataUpdatedAt).join(","), projectId, layout?.projects]);

    // Timeline range: two weeks before the earliest date to a month after the latest.
    const { origin, totalDays } = useMemo(() => {
        const dates = rows.flatMap((r) => (r.kind === "project" ? [] : [r.start, r.end])).filter(Boolean) as Date[];
        const today = startOfDay(new Date());
        const min = dates.length ? new Date(Math.min(...dates.map(Number), today.getTime())) : addDays(today, -14);
        const max = dates.length ? new Date(Math.max(...dates.map(Number), today.getTime())) : addDays(today, 45);
        const o = addDays(startOfDay(min), -7);
        return { origin: o, totalDays: Math.max(30, differenceInCalendarDays(max, o) + 30) };
    }, [rows]);

    const xOf = (d: Date) => differenceInCalendarDays(d, origin) * dayW;
    const timelineWidth = totalDays * dayW;
    const todayX = xOf(startOfDay(new Date()));

    // The day pinned to the left edge: just before today until the user scrolls.
    // Android resets or clamps a horizontal ScrollView's offset when its content
    // changes (expanding a task, a wider range, a new zoom) — sometimes after a
    // scrollTo has already landed — so any scroll the user didn't make is
    // steered back to the pinned day.
    const timeline = useRef<ScrollView>(null);
    const leftDate = useRef<Date>(addDays(startOfDay(new Date()), -Math.ceil(80 / dayW)));
    const userScrolling = useRef(false);
    const pinnedX = () => Math.max(0, xOf(leftDate.current));
    const pinLeft = () => timeline.current?.scrollTo({ x: pinnedX(), animated: false });
    const rememberLeft = (x: number) => (leftDate.current = addDays(origin, Math.round(x / dayW)));
    useEffect(() => {
        pinLeft();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [origin.getTime(), dayW]);

    const save = async (task: Task, start: Date, end: Date) => {
        qc.setQueryData(qk.subtasks(task.parentTaskId ?? "", { gantt: true, ...filterParams }), (old: any) =>
            old ? { ...old, subTasks: old.subTasks.map((s: Task) => (s.id === task.id ? { ...s, startDate: start.toISOString(), dueDate: end.toISOString() } : s)) } : old,
        );
        try {
            await tasksApi.patchFields(task.id, { workspaceId, projectId: task.projectId }, { startDate: forApi(start, "start"), dueDate: forApi(end, "end") });
            toast.success("Dates updated");
        } catch (e) {
            toast.fromError(e, "Failed to update dates");
        } finally {
            qc.invalidateQueries({ queryKey: ["tasks", "subtasks", task.parentTaskId ?? ""] });
        }
    };

    // Dependency arrows between loaded subtask bars. Each arrow gets its own
    // Svg sized to its bounding box: Android rasterises an Svg as one bitmap,
    // and a chart-sized one passes the canvas limit and crashes the app.
    const barIndex = new Map<string, { y: number; start: number; end: number }>();
    rows.forEach((r, i) => {
        if (r.kind === "sub" && r.start && r.end) barIndex.set(r.task.id, { y: i * ROW_H + ROW_H / 2, start: xOf(r.start), end: xOf(r.end) });
    });
    const arrows: { key: string; left: number; top: number; width: number; height: number; d: string }[] = [];
    rows.forEach((r) => {
        if (r.kind !== "sub") return;
        const to = barIndex.get(r.task.id);
        if (!to) return;
        for (const depId of dependencyIds(r.task)) {
            const from = barIndex.get(depId);
            if (!from) continue;
            const midX = Math.max(from.end + 8, to.start - 8);
            const xs = [from.end, midX, to.start - 2];
            const left = Math.min(...xs) - 2;
            const top = Math.min(from.y, to.y) - 2;
            const width = Math.max(...xs) - left + 4;
            const height = Math.abs(to.y - from.y) + 4;
            if (width * height > 4_000_000) continue; // a link spanning years at day zoom: not drawable safely
            const x = (v: number) => v - left;
            const y = (v: number) => v - top;
            arrows.push({ key: `${depId}-${r.task.id}`, left, top, width, height, d: `M${x(from.end)} ${y(from.y)} H${x(midX)} V${y(to.y)} H${x(to.start - 2)}` });
        }
    });

    const months = useMemo(() => {
        const out: { x: number; label: string }[] = [];
        for (let i = 0; i < totalDays; i++) {
            const d = addDays(origin, i);
            if (i === 0 || d.getDate() === 1) out.push({ x: i * dayW, label: format(d, zoom === "month" ? "MMM yy" : "MMMM yyyy") });
        }
        return out;
    }, [origin, totalDays, dayW, zoom]);

    const toggle = (id: string) =>
        setExpanded((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });

    return (
        <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingVertical: 16, paddingBottom: 120 }}
            refreshControl={<RefreshControl refreshing={parents.isRefetching} onRefresh={() => parents.refetch()} tintColor={colors.primaryInk} />}
            onScroll={(e) => {
                const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
                if (contentOffset.y + layoutMeasurement.height > contentSize.height - 300 && parents.hasNextPage && !parents.isFetchingNextPage) parents.fetchNextPage();
            }}
            scrollEventThrottle={200}
        >
            <View style={{ paddingHorizontal: 16, gap: 12, marginBottom: 12 }}>
                {header}
                <Tabs
                    scrollable={false}
                    compact
                    value={zoom}
                    onChange={setZoom}
                    items={[
                        { key: "day", label: "Day" },
                        { key: "week", label: "Week" },
                        { key: "month", label: "Month" },
                    ]}
                />
            </View>
            {parents.isLoading ? (
                <ActivityIndicator color={colors.primaryInk} style={{ marginTop: 24 }} />
            ) : rows.length === 0 ? (
                <EmptyState icon={GanttChartSquare} title="Nothing to plot" description="Tasks with start and due dates appear on the timeline." />
            ) : (
                <View style={[styles.frame, { borderColor: colors.border, backgroundColor: colors.card }]}>
                    {/* Fixed task-name column */}
                    <View style={{ width: LEFT_W, borderRightWidth: 1, borderRightColor: colors.border }}>
                        <View style={[styles.leftHeader, { borderBottomColor: colors.border, backgroundColor: colors.secondary }]}>
                            <Text variant="overline" tone="muted">
                                Task
                            </Text>
                        </View>
                        {rows.map((r, i) =>
                            r.kind === "project" ? (
                                <View key={`p-${r.id}-${i}`} style={[styles.leftRow, { backgroundColor: colors.muted }]}>
                                    <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: r.color || colors.primary }} />
                                    <Text variant="caption" weight="bold" numberOfLines={1} style={{ flex: 1 }}>
                                        {r.name}
                                    </Text>
                                </View>
                            ) : r.kind === "parent" ? (
                                <Pressable key={r.task.id} onPress={() => toggle(r.task.id)} style={styles.leftRow}>
                                    {expanded.has(r.task.id) ? <ChevronDown size={14} color={colors.mutedForeground} /> : <ChevronRight size={14} color={colors.mutedForeground} />}
                                    <Text variant="small" weight="semibold" numberOfLines={1} style={{ flex: 1 }}>
                                        {r.task.name}
                                    </Text>
                                </Pressable>
                            ) : (
                                <SubtaskName key={r.task.id} task={r.task} />
                            ),
                        )}
                    </View>

                    {/* Scrollable timeline */}
                    <ScrollView
                        ref={timeline}
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        onContentSizeChange={pinLeft}
                        scrollEventThrottle={32}
                        onScroll={(e) => {
                            if (!userScrolling.current && Math.abs(e.nativeEvent.contentOffset.x - pinnedX()) > 1) pinLeft();
                        }}
                        onScrollBeginDrag={() => (userScrolling.current = true)}
                        onScrollEndDrag={(e) => {
                            rememberLeft(e.nativeEvent.contentOffset.x);
                            // A fling continues as momentum; stay hands-off until it ends.
                            if (Math.abs(e.nativeEvent.velocity?.x ?? 0) < 0.01) userScrolling.current = false;
                        }}
                        onMomentumScrollBegin={() => (userScrolling.current = true)}
                        onMomentumScrollEnd={(e) => {
                            rememberLeft(e.nativeEvent.contentOffset.x);
                            userScrolling.current = false;
                        }}
                    >
                        <View style={{ width: timelineWidth }}>
                            <View style={[styles.timeHeader, { borderBottomColor: colors.border, backgroundColor: colors.secondary }]}>
                                {months.map((m) => (
                                    <Text key={m.x} variant="caption" weight="bold" style={{ position: "absolute", left: m.x + 6, top: 4 }}>
                                        {m.label}
                                    </Text>
                                ))}
                                {zoom !== "month"
                                    ? Array.from({ length: totalDays }).map((_, i) => {
                                          const d = addDays(origin, i);
                                          if (zoom === "week" && d.getDay() !== 1) return null;
                                          return (
                                              <Text key={i} style={{ position: "absolute", left: i * dayW, width: zoom === "day" ? dayW : dayW * 7, top: 24, fontSize: 10, fontFamily: fonts.medium, color: colors.mutedForeground, textAlign: zoom === "day" ? "center" : "left" }}>
                                                  {zoom === "day" ? format(d, "d") : format(d, "d MMM")}
                                              </Text>
                                          );
                                      })
                                    : null}
                            </View>
                            <View style={{ height: rows.length * ROW_H }}>
                                {/* Weekend shading */}
                                {zoom === "day"
                                    ? Array.from({ length: totalDays }).map((_, i) =>
                                          isWeekend(addDays(origin, i)) ? <View key={i} style={{ position: "absolute", left: i * dayW, width: dayW, top: 0, bottom: 0, backgroundColor: colors.muted }} /> : null,
                                      )
                                    : null}
                                {rows.map((r, i) => (
                                    <View key={i} style={{ position: "absolute", top: i * ROW_H, left: 0, right: 0, height: ROW_H, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: r.kind === "project" ? colors.muted : "transparent" }} />
                                ))}
                                <View style={{ position: "absolute", left: todayX, top: 0, bottom: 0, width: 2, backgroundColor: colors.destructive, opacity: 0.7 }} />
                                {arrows.map((a) => (
                                    <Svg key={a.key} style={{ position: "absolute", left: a.left, top: a.top }} width={a.width} height={a.height} pointerEvents="none">
                                        <Path d={a.d} stroke={colors.mutedForeground} strokeWidth={1.4} fill="none" strokeDasharray="4 3" />
                                    </Svg>
                                ))}
                                {rows.map((r, i) => {
                                    if (r.kind === "project" || !r.start || !r.end) return null;
                                    const left = xOf(r.start);
                                    const width = Math.max(dayW, xOf(addDays(r.end, 1)) - left);
                                    if (r.kind === "parent") {
                                        const status = aggregateStatus(r.task.subtaskStatusCounts);
                                        const color = statusColor(status);
                                        return (
                                            <View key={r.task.id} style={[styles.bar, { top: i * ROW_H + 13, left, width, height: 18, backgroundColor: tint(color, 0.25), borderColor: color }]}>
                                                <View style={{ width: `${parentProgress(r.task.subtaskStatusCounts)}%`, height: "100%", backgroundColor: color, borderRadius: 4 }} />
                                            </View>
                                        );
                                    }
                                    return <SubtaskBar key={r.task.id} task={r.task} top={i * ROW_H + 9} left={left} width={width} dayW={dayW} start={r.start} end={r.end} onSave={save} />;
                                })}
                            </View>
                        </View>
                    </ScrollView>
                </View>
            )}
            {parents.isFetchingNextPage ? <ActivityIndicator color={colors.primaryInk} style={{ marginTop: 12 }} /> : null}
        </ScrollView>
    );
}

function SubtaskName({ task }: { task: Task }) {
    const navigation = useNavigation<any>();
    return (
        <Pressable onPress={() => navigation.navigate("TaskDetail", { taskId: task.id, title: task.name })} style={[styles.leftRow, { paddingLeft: 26 }]}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: statusColor(task.status) }} />
            <Text variant="small" numberOfLines={1} style={{ flex: 1 }}>
                {task.name}
            </Text>
        </Pressable>
    );
}

/** draggable-subtask-bar.tsx: long-press then drag to move; drag the end handle to resize. */
const SubtaskBar = memo(function SubtaskBar({
    task,
    top,
    left,
    width,
    dayW,
    start,
    end,
    onSave,
}: {
    task: Task;
    top: number;
    left: number;
    width: number;
    dayW: number;
    start: Date;
    end: Date;
    onSave: (task: Task, start: Date, end: Date) => void;
}) {
    const navigation = useNavigation<any>();
    const { colors } = useTheme();
    const { access } = useProjectAccess(task.projectId);
    const editable = canEditTask(access, task);
    const color = statusColor(task.status);
    const tx = useSharedValue(0);
    const tw = useSharedValue(0);
    const active = useSharedValue(0);

    const haptic = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const commitMove = (days: number) => days !== 0 && onSave(task, addDays(start, days), addDays(end, days));
    const commitResize = (days: number) => {
        if (days === 0) return;
        const nextEnd = addDays(end, days);
        if (nextEnd < start) return;
        onSave(task, start, nextEnd);
    };
    const open = () => navigation.navigate("TaskDetail", { taskId: task.id, title: task.name });

    const move = Gesture.Pan()
        .enabled(editable)
        .activateAfterLongPress(280)
        .onStart(() => {
            active.value = 1;
            runOnJS(haptic)();
        })
        .onUpdate((e) => {
            tx.value = Math.round(e.translationX / dayW) * dayW;
        })
        .onEnd(() => {
            const days = Math.round(tx.value / dayW);
            runOnJS(commitMove)(days);
        })
        .onFinalize(() => {
            tx.value = 0;
            active.value = 0;
        });

    const resize = Gesture.Pan()
        .enabled(editable)
        .activateAfterLongPress(120)
        .onStart(() => {
            active.value = 1;
            runOnJS(haptic)();
        })
        .onUpdate((e) => {
            tw.value = Math.max(-width + dayW, Math.round(e.translationX / dayW) * dayW);
        })
        .onEnd(() => {
            runOnJS(commitResize)(Math.round(tw.value / dayW));
        })
        .onFinalize(() => {
            tw.value = 0;
            active.value = 0;
        });

    const tap = Gesture.Tap().onEnd(() => runOnJS(open)());

    const style = useAnimatedStyle(() => ({
        transform: [{ translateX: tx.value }, { scale: active.value ? 1.04 : 1 }],
        width: width + tw.value,
        opacity: active.value ? 0.9 : 1,
        zIndex: active.value ? 10 : 1,
    }));

    return (
        <GestureDetector gesture={Gesture.Exclusive(move, tap)}>
            <Animated.View style={[styles.bar, { top, left, height: 26, backgroundColor: tint(color, 0.22), borderColor: color }, style]}>
                <View style={{ width: `${subtaskProgress(task)}%`, height: "100%", backgroundColor: color, borderRadius: 5, opacity: 0.4 }} />
                <Text numberOfLines={1} style={{ position: "absolute", left: 6, right: 12, top: 5, fontSize: 11, fontFamily: fonts.semibold, color: colors.foreground }}>
                    {width > 60 ? task.name : ""}
                </Text>
                {editable ? (
                    <GestureDetector gesture={resize}>
                        <View style={styles.handle}>
                            <View style={{ width: 2, height: 12, borderRadius: 1, backgroundColor: color }} />
                        </View>
                    </GestureDetector>
                ) : null}
            </Animated.View>
        </GestureDetector>
    );
});

const styles = StyleSheet.create({
    frame: { flexDirection: "row", marginHorizontal: 16, borderRadius: radius.lg, borderWidth: 1, overflow: "hidden" },
    leftHeader: { height: HEADER_H, justifyContent: "center", paddingHorizontal: 10, borderBottomWidth: 1 },
    leftRow: { height: ROW_H, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10 },
    timeHeader: { height: HEADER_H, borderBottomWidth: 1 },
    bar: { position: "absolute", borderRadius: 6, borderWidth: 1, overflow: "hidden", justifyContent: "center" },
    handle: { position: "absolute", right: 0, top: 0, bottom: 0, width: 14, alignItems: "center", justifyContent: "center" },
});
