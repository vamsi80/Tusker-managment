import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
    RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { format, startOfDay } from "date-fns";
import { SPACING, TOUCH_TARGET, FONTS, BORDER_RADIUS, ELEVATION } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import { ListSkeleton } from "../../components/ScreenSkeleton";
import { haptics } from "../../services/haptics";
import { Task } from "../../types";
import StatusChip, { StatusKind } from "../../components/StatusChip";
import {
    calculateTimelineRange,
    getDaysBetween,
    calculateBarPosition,
    computeTaskDates,
    calculateProgress,
    calculateParentProgress,
    calculateDelay,
} from "../../utils/mobileGanttUtils";
import { useWorkspace } from "../../context/WorkspaceContext";
import { getSubTasks, getTasks, getProjectPermissions, ProjectPermissions } from "../../services/api";
import { canEditGanttBar } from "../../utils/ganttEditPermissions";
import MobileGanttBar from "../../components/gantt/MobileGanttBar";
import DependencyLines, { DependencyBarPosition } from "../../components/gantt/DependencyLines";

// ─── Layout constants ─────────────────────────────────────────────────────────
// Column order/widths mirror web's sidebar exactly (Task Name | Assignee |
// Progress | Status | Days | Dates) — see --col-* vars in gantt-chart.tsx —
// scaled down to fit a phone screen inside the same horizontal scroll.
const ROW_H = 52;
const NAME_W = 160;
const ASSIGNEE_W = 96;
const PROGRESS_W = 76;
const STATUS_W = 104;
const DAYS_W = 52;
const DATES_W = 122;
const TOTAL_TABLE_W = NAME_W + ASSIGNEE_W + PROGRESS_W + STATUS_W + DAYS_W + DATES_W;
// Two-tier header like web's TimelineHeader: a month band, then day numbers.
const MONTH_ROW_H = 22;
const DAY_ROW_H = 30;
const HEADER_H = MONTH_ROW_H + DAY_ROW_H;
// Width, in px, of a single day column in the timeline pane.
const DAY_W = 34;

// ─── Status label/kind maps (semantic, theme-driven via StatusChip) ──────────
const STATUS_LABELS: Record<string, string> = {
    TO_DO: "To Do",
    IN_PROGRESS: "In Progress",
    REVIEW: "Review",
    HOLD: "Hold",
    COMPLETED: "Completed",
    CANCELLED: "Cancelled",
};
const STATUS_KINDS: Record<string, StatusKind> = {
    TO_DO: "todo",
    IN_PROGRESS: "inProgress",
    REVIEW: "review",
    HOLD: "hold",
    COMPLETED: "completed",
    CANCELLED: "cancelled",
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface FlatItem {
    id: string;
    type: "project" | "task" | "empty";
    name: string;
    indentLevel: number;
    hasSubtasks: boolean;
    isExpanded: boolean;
    task?: Task;
    projectColor?: string;
}

interface MonthGroup { label: string; days: number }
interface DayColumn { label: string; isToday: boolean }

// ─── Month-label helper ───────────────────────────────────────────────────────
function buildMonthGroups(start: Date, totalDays: number): MonthGroup[] {
    const groups: MonthGroup[] = [];
    let cur = new Date(start);
    for (let d = 0; d < totalDays;) {
        const label = format(cur, "MMM yyyy");
        const endOfMonth = new Date(cur.getFullYear(), cur.getMonth() + 1, 0);
        const daysLeft = Math.floor((endOfMonth.getTime() - cur.getTime()) / 86400000) + 1;
        const count = Math.min(daysLeft, totalDays - d);
        groups.push({ label, days: count });
        d += count;
        cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }
    return groups;
}

// ─── Day-number header row — mirrors web's TimelineHeader day columns ────────
function buildDayColumns(start: Date, totalDays: number): DayColumn[] {
    const today = startOfDay(new Date());
    const out: DayColumn[] = [];
    for (let d = 0; d < totalDays; d++) {
        const cur = new Date(start);
        cur.setDate(cur.getDate() + d);
        out.push({ label: String(cur.getDate()), isToday: cur.toDateString() === today.toDateString() });
    }
    return out;
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface ProjectGanttViewProps {
    projectId: string;
    tasks: Task[];
    loading: boolean;
    refreshData: () => void;
    navigation: any;
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function ProjectGanttView({
    projectId,
    tasks,
    loading,
    refreshData,
    navigation,
}: ProjectGanttViewProps) {
    const { colors } = useTheme();
    const { activeWorkspace, projects } = useWorkspace();
    const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
    const [lazySubtasks, setLazySubtasks] = useState<Map<string, Task[]>>(new Map());
    const [fetchingIds, setFetchingIds] = useState<Set<string>>(new Set());
    // Per-project parent tasks, fetched lazily on expand instead of relying on
    // the workspace-wide Gantt batch (MyBoardScreen's fetchGanttData caps at
    // 150 tasks total, so a project created later — or just further down the
    // list — could have real tasks that never made it into that one fetch).
    // This mirrors the existing per-task subtask lazy-load below.
    const [lazyProjectTasks, setLazyProjectTasks] = useState<Map<string, Task[]>>(new Map());
    const [fetchingProjectIds, setFetchingProjectIds] = useState<Set<string>>(new Set());
    const [loadedProjectIds, setLoadedProjectIds] = useState<Set<string>>(new Set());
    const requestedProjectIdsRef = useRef<Set<string>>(new Set());
    // Edit permissions for drag-to-move/resize — only meaningful in the
    // single-project view; the workspace-grouped view spans many projects so
    // dragging stays disabled there (see `permissions` usage below).
    const [permissions, setPermissions] = useState<ProjectPermissions | null>(null);
    // Optimistic date overrides applied after a successful drag/resize, keyed
    // by task id, until the next refetch replaces them with server data.
    const [dateOverrides, setDateOverrides] = useState<Map<string, { startDate: string; dueDate: string }>>(new Map());

    useEffect(() => {
        if (!projectId || !activeWorkspace) {
            setPermissions(null);
            return;
        }
        let cancelled = false;
        getProjectPermissions(projectId, activeWorkspace.id).then(p => {
            if (!cancelled) setPermissions(p);
        });
        return () => { cancelled = true; };
    }, [projectId, activeWorkspace]);

    const handleDatesChanged = useCallback((taskId: string, startISO: string, endISO: string) => {
        setDateOverrides(prev => {
            const next = new Map(prev);
            next.set(taskId, { startDate: startISO, dueDate: endISO });
            return next;
        });
    }, []);

    const allRelevantTasks = useMemo(() => {
        const itemIds = new Set(tasks.map(t => t.id));
        const out = [...tasks];
        const mergeIn = (list: Task[]) => list.forEach(t => {
            if (!itemIds.has(t.id)) {
                out.push(t);
                itemIds.add(t.id);
            }
        });
        lazyProjectTasks.forEach(mergeIn);
        lazySubtasks.forEach(mergeIn);
        return out.map(t => {
            const ov = dateOverrides.get(t.id);
            return ov ? { ...t, startDate: ov.startDate, dueDate: ov.dueDate } : t;
        });
    }, [tasks, lazyProjectTasks, lazySubtasks, dateOverrides]);

    // Workspace mode (no projectId) groups rows under collapsible project nodes,
    // and a project row never draws a bar of its own. Left collapsed, the chart
    // renders as a bare list of project names against an empty timeline — so
    // seed each group as expanded the first time it appears. Tracked in a ref so
    // a deliberate collapse by the user is not undone on the next render.
    const seededProjectsRef = useRef<Set<string>>(new Set());

    // Group tasks by project (if projectId is empty). The project list itself
    // comes straight from the workspace context — the same source and order
    // as the Projects tab (ProjectsScreen.tsx) — instead of being inferred
    // from whichever tasks happen to be loaded, so a project with no tasks
    // (or one trimmed by the Gantt fetch's 150-task cap) still shows up.
    const { projectsList, projectParentTasksMap } = useMemo(() => {
        const pm = new Map<string, Task[]>();
        const itemIds = new Set(allRelevantTasks.map(x => x.id));

        allRelevantTasks.forEach(t => {
            const projId = t.projectId || "no-project";
            if (!t.parentTaskId || !itemIds.has(t.parentTaskId)) {
                const list = pm.get(projId) ?? [];
                if (!list.find(existing => existing.id === t.id)) {
                    list.push(t);
                }
                pm.set(projId, list);
            }
        });

        const list = projects.map(p => ({ id: p.id, name: p.name, color: p.color }));

        // Fallback bucket for tasks whose project isn't in the workspace's
        // project list (e.g. one the user lost access to) — keep them visible
        // rather than silently dropping their tasks from the chart.
        if (pm.has("no-project") || Array.from(pm.keys()).some(id => !list.find(p => p.id === id))) {
            Array.from(pm.keys()).forEach(projId => {
                if (projId !== "no-project" && list.find(p => p.id === projId)) return;
                const sample = pm.get(projId)?.[0];
                list.push({ id: projId, name: sample?.project?.name || "No Project", color: sample?.project?.color });
            });
        }

        return { projectsList: list, projectParentTasksMap: pm };
    }, [allRelevantTasks, projects]);

    // ── 2. Hierarchy flattening ─────────────────────────────────────────────
    useEffect(() => {
        if (projectId) return;
        const unseen = projectsList.filter(p => !seededProjectsRef.current.has(p.id));
        if (unseen.length === 0) return;
        setExpandedNodes(prev => {
            const next = new Set(prev);
            unseen.forEach(p => {
                next.add(`project-${p.id}`);
                seededProjectsRef.current.add(p.id);
            });
            return next;
        });
    }, [projectId, projectsList]);

    // Fetch a project's own parent tasks on demand (project-scoped, not
    // capped by the workspace-wide 150-task Gantt batch), so every project
    // reliably shows the tasks it actually has once expanded.
    const loadProjectTasks = useCallback(async (projId: string) => {
        if (!activeWorkspace || projId === "no-project") return;
        setFetchingProjectIds(prev => new Set(prev).add(projId));
        try {
            const result = await getTasks(activeWorkspace.id, {
                projectId: projId,
                hierarchyMode: "parents",
                view_mode: "gantt",
                includeSubTasks: true,
                limit: 300,
            });
            setLazyProjectTasks(prev => {
                const next = new Map(prev);
                next.set(projId, result.tasks);
                return next;
            });
        } catch (e) {
            console.error("[Gantt] Error fetching project tasks:", e);
        } finally {
            setLoadedProjectIds(prev => new Set(prev).add(projId));
            setFetchingProjectIds(prev => {
                const next = new Set(prev);
                next.delete(projId);
                return next;
            });
        }
    }, [activeWorkspace]);

    // Trigger the fetch above for any project node that's expanded (whether
    // by the auto-seed effect or a manual tap) and hasn't been requested yet.
    useEffect(() => {
        if (projectId) return;
        projectsList.forEach(p => {
            if (p.id === "no-project") return;
            if (!expandedNodes.has(`project-${p.id}`)) return;
            if (requestedProjectIdsRef.current.has(p.id)) return;
            requestedProjectIdsRef.current.add(p.id);
            loadProjectTasks(p.id);
        });
    }, [projectId, projectsList, expandedNodes, loadProjectTasks]);

    const { roots, childMap } = useMemo(() => {
        const cm = new Map<string, Task[]>();
        const itemIds = new Set(allRelevantTasks.map(t => t.id));

        allRelevantTasks.forEach(t => {
            if (t.parentTaskId) {
                const list = cm.get(t.parentTaskId) ?? [];
                if (!list.find(existing => existing.id === t.id)) {
                    list.push(t);
                }
                cm.set(t.parentTaskId, list);
            }
        });

        // Sort all child lists by position
        cm.forEach((list, key) => {
            cm.set(key, list.sort((a, b) => (a.position ?? 0) - (b.position ?? 0)));
        });

        const rs = allRelevantTasks
            .filter(t => !t.parentTaskId || !itemIds.has(t.parentTaskId))
            .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

        return { roots: rs, childMap: cm };
    }, [allRelevantTasks]);


    const flatItems = useMemo<FlatItem[]>(() => {
        const out: FlatItem[] = [];

        const walkTask = (task: Task, depth: number) => {
            const children = childMap.get(task.id) ?? [];
            const hasSubtasks = children.length > 0 || (task._count?.subTasks ?? 0) > 0 || task.isParent;
            const expanded = expandedNodes.has(task.id);

            out.push({
                id: task.id,
                type: "task",
                name: task.name,
                indentLevel: depth,
                hasSubtasks,
                isExpanded: expanded,
                task,
            });

            if (expanded) {
                children.forEach(c => walkTask(c, depth + 1));
            }
        };

        if (!projectId) {
            // Group by Project — every project always gets an expand/collapse
            // chevron, even with zero tasks currently loaded, so the dropdown
            // control itself is never silently missing for a given project.
            projectsList.forEach(proj => {
                const projNodeId = `project-${proj.id}`;
                const parentTasks = projectParentTasksMap.get(proj.id) ?? [];
                const expanded = expandedNodes.has(projNodeId);

                out.push({
                    id: projNodeId,
                    type: "project",
                    name: proj.name,
                    indentLevel: 0,
                    hasSubtasks: true,
                    isExpanded: expanded,
                    projectColor: proj.color,
                });

                if (expanded) {
                    if (parentTasks.length > 0) {
                        parentTasks.forEach(pt => walkTask(pt, 1));
                    } else if (loadedProjectIds.has(proj.id) && !fetchingProjectIds.has(proj.id)) {
                        // Only claim "no tasks" once the project-scoped fetch
                        // has actually completed — otherwise this would flash
                        // before the real tasks (loaded lazily) arrive.
                        out.push({
                            id: `${projNodeId}-empty`,
                            type: "empty",
                            name: "No tasks in this project",
                            indentLevel: 1,
                            hasSubtasks: false,
                            isExpanded: false,
                        });
                    }
                }
            });
        } else {
            // Standard single project hierarchy
            roots.forEach(r => walkTask(r, 0));
        }

        return out;
    }, [projectId, projectsList, projectParentTasksMap, roots, childMap, expandedNodes, loadedProjectIds, fetchingProjectIds]);

    const toggleExpand = useCallback(async (id: string, task?: Task) => {
        const isExpanding = !expandedNodes.has(id);

        if (id.startsWith("project-")) {
            setExpandedNodes(prev => {
                const next = new Set(prev);
                isExpanding ? next.add(id) : next.delete(id);
                return next;
            });
            return;
        }

        if (task && isExpanding) {
            const children = childMap.get(id) ?? [];
            const hasSubCount = (task._count?.subTasks ?? 0) > 0 || task.isParent;

            // If no children in map but count > 0, fetch them
            if (children.length === 0 && hasSubCount && activeWorkspace) {
                setFetchingIds(prev => new Set(prev).add(id));
                try {
                    const data = await getSubTasks(id, activeWorkspace.id, task.projectId || projectId);
                    setLazySubtasks(prev => {
                        const next = new Map(prev);
                        next.set(id, data);
                        return next;
                    });
                } catch (e) {
                    console.error("[Gantt] Error fetching subtasks:", e);
                } finally {
                    setFetchingIds(prev => {
                        const next = new Set(prev);
                        next.delete(id);
                        return next;
                    });
                }
            }
        }

        setExpandedNodes(prev => {
            const next = new Set(prev);
            isExpanding ? next.add(id) : next.delete(id);
            return next;
        });
    }, [expandedNodes, childMap, activeWorkspace, projectId]);


    // ── 4. Formatting Helpers ───────────────────────────────────────────────
    const formatTaskDates = useCallback((task: Task) => {
        const dates = computeTaskDates(task, allRelevantTasks);
        if (!dates.start || !dates.end) return "-";
        return `${format(dates.start, "dd/MM/yy")} - ${format(dates.end, "dd/MM/yy")}`;
    }, [allRelevantTasks]);

    const getDuration = useCallback((task: Task) => {
        const dates = computeTaskDates(task, allRelevantTasks);
        if (!dates.start || !dates.end) return "-";
        return getDaysBetween(dates.start, dates.end) + 1;
    }, [allRelevantTasks]);

    // Progress % — ported from web's calculateProgress/parentProgress
    // (apps/web/.../gantt/transform-tasks.ts): a task with children rolls up
    // a weighted average of their progress, a leaf derives it from status+dates.
    const getTaskProgress = useCallback((task: Task): number => {
        const children = childMap.get(task.id) ?? [];
        if (children.length > 0) {
            return calculateParentProgress(
                children.map(c => ({ progress: getTaskProgress(c), days: c.days || 1 }))
            );
        }
        const dates = computeTaskDates(task, allRelevantTasks);
        return calculateProgress(task.status, dates.start, dates.end);
    }, [childMap, allRelevantTasks]);

    // ── 5. Timeline geometry (today marker + bar positions) ─────────────────
    const timelineRange = useMemo(() => calculateTimelineRange(allRelevantTasks), [allRelevantTasks]);
    const totalDays = useMemo(
        () => Math.max(1, getDaysBetween(timelineRange.start, timelineRange.end) + 1),
        [timelineRange]
    );
    const timelineWidth = totalDays * DAY_W;
    const monthGroups = useMemo(
        () => buildMonthGroups(timelineRange.start, totalDays),
        [timelineRange, totalDays]
    );
    const dayColumns = useMemo(
        () => buildDayColumns(timelineRange.start, totalDays),
        [timelineRange, totalDays]
    );
    const timelineScrollRef = useRef<ScrollView>(null);
    const didAutoScrollRef = useRef(false);

    const todayOffset = useMemo(() => {
        const today = startOfDay(new Date());
        if (today < timelineRange.start || today > timelineRange.end) return null;
        return getDaysBetween(timelineRange.start, today) * DAY_W;
    }, [timelineRange]);

    // Bar positions for every rendered row, used to draw dependency
    // connector lines (mirrors web's dependency-lines.tsx) between subtasks.
    const dependencyBars = useMemo<DependencyBarPosition[]>(() => {
        const bars: DependencyBarPosition[] = [];
        flatItems.forEach((item, idx) => {
            if (item.type !== "task" || !item.task) return;
            const dates = computeTaskDates(item.task, allRelevantTasks);
            if (!dates.start || !dates.end) return;
            const pos = calculateBarPosition(dates.start, dates.end, timelineRange.start, totalDays);
            const leftPx = (pos.left / 100) * timelineWidth;
            const widthPx = Math.max(14, (pos.width / 100) * timelineWidth);
            const isSub = item.indentLevel > 0;
            const barTop = isSub ? 34 : 8;
            const barHeight = isSub ? 14 : 24;
            bars.push({
                id: item.task.id,
                status: item.task.status,
                dependsOnIds: item.task.dependsOnIds,
                x: leftPx,
                endX: leftPx + widthPx,
                y: idx * ROW_H + barTop + barHeight / 2,
            });
        });
        return bars;
    }, [flatItems, allRelevantTasks, timelineRange, totalDays, timelineWidth]);


    // The range spans the earliest task to the latest, so across a whole
    // workspace "today" can sit far to the right and the first screen shows
    // empty timeline. Scroll to today once, keeping a few days of lead-in.
    useEffect(() => {
        if (didAutoScrollRef.current) return;
        if (todayOffset == null || flatItems.length === 0) return;
        didAutoScrollRef.current = true;
        const x = Math.max(0, todayOffset - DAY_W * 3);
        requestAnimationFrame(() => {
            timelineScrollRef.current?.scrollTo({ x, animated: false });
        });
    }, [todayOffset, flatItems.length]);

    // ── 6. Render helpers ───────────────────────────────────────────────────
    const renderRow = (item: FlatItem) => {
        const { task, indentLevel, hasSubtasks, isExpanded } = item;
        const isProject = item.type === "project";
        const isEmpty = item.type === "empty";
        const isSubtask = indentLevel > 0 && !isEmpty;

        const status = task?.status ?? "TO_DO";
        const statusLabel = STATUS_LABELS[status] ?? status;
        const statusKind = STATUS_KINDS[status] ?? "todo";
        const datesText = task ? formatTaskDates(task) : "-";
        const duration = task ? getDuration(task) : "-";
        const assigneeName = task?.assignee?.surname || task?.assignee?.name || "-";

        const dates = task ? computeTaskDates(task, allRelevantTasks) : { start: null, end: null };
        const barPos = (!isProject && task && dates.start && dates.end)
            ? calculateBarPosition(dates.start, dates.end, timelineRange.start, totalDays)
            : null;
        const progress = (!isProject && task) ? getTaskProgress(task) : 0;
        const delay = (!isProject && task)
            ? calculateDelay(dates.end, task.status, totalDays)
            : undefined;
        const canEdit = (!isProject && task && isSubtask)
            ? canEditGanttBar(task, permissions)
            : false;

        return (
            <View
                key={item.id}
                style={[
                    s.row,
                    {
                        height: ROW_H,
                        width: TOTAL_TABLE_W + timelineWidth,
                        backgroundColor: isProject
                            ? colors.backgroundElevated
                            : isSubtask ? colors.surfaceHighlight : colors.surface,
                        borderBottomColor: colors.border,
                    }
                ]}
            >
                {/* 1. TASK NAME */}
                <TouchableOpacity
                    activeOpacity={isEmpty ? 1 : 0.7}
                    disabled={isEmpty}
                    onPress={() =>
                        hasSubtasks
                            ? toggleExpand(item.id, task)
                            : (!isProject && task ? navigation.navigate("TaskDetail", { taskId: task.id, taskName: task.name }) : null)
                    }
                    style={[
                        s.cell,
                        {
                            width: NAME_W,
                            paddingLeft: 12 + indentLevel * 14,
                        }
                    ]}
                >
                    {/* Expand icon */}
                    {hasSubtasks && (
                        (!isProject && task && fetchingIds.has(task.id)) ||
                        (isProject && fetchingProjectIds.has(item.id.replace(/^project-/, ""))) ? (
                            <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: 4, transform: [{ scale: 0.7 }] }} />
                        ) : (
                            <Ionicons
                                name={isExpanded ? "chevron-down" : "chevron-forward"}
                                size={14}
                                color={colors.primary}
                                style={{ marginRight: 4 }}
                            />
                        )
                    )}

                    {/* Project color bullet for project nodes */}
                    {isProject && (
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.projectColor || colors.primary, marginRight: 6 }} />
                    )}

                    {/* Subtask arrow (only for nested subtask levels) */}
                    {!isProject && isSubtask && indentLevel > 1 && (
                        <Ionicons name="return-down-forward-outline" size={11} color={colors.textDim} style={{ marginRight: 4 }} />
                    )}

                    <Text
                        numberOfLines={1}
                        style={[
                            s.cellText,
                            {
                                color: isEmpty ? colors.textDim : colors.text,
                                fontFamily: isProject ? FONTS.bold : (isSubtask ? FONTS.medium : FONTS.bold),
                                fontSize: isProject ? 13 : (isSubtask ? 11 : 12),
                                fontStyle: isEmpty ? "italic" : "normal",
                                flex: 1,
                            }
                        ]}
                    >
                        {item.name}
                    </Text>

                    {/* Subtask count pill — matches web's task-row.tsx badge */}
                    {!isProject && hasSubtasks && (
                        <View style={[s.countPill, { backgroundColor: colors.border + "40" }]}>
                            <Text style={[s.countPillText, { color: colors.textDim }]}>
                                {(task?.subTasks?.length ?? task?.subtaskCount) ?? (childMap.get(task?.id ?? "")?.length ?? 0)}
                            </Text>
                        </View>
                    )}
                </TouchableOpacity>

                {/* 2-5. Assignee / Progress / Status / Days / Dates — blank for
                    rows with children (their own value is an aggregate), filled
                    for leaf rows, matching web's task-row.tsx / sortable-subtask-list.tsx */}
                <View style={[s.cell, s.colBorder, { width: ASSIGNEE_W, paddingHorizontal: 8, justifyContent: "center", borderLeftColor: colors.border + "22" }]}>
                    {!isProject && !isEmpty && !hasSubtasks && (
                        <Text numberOfLines={1} style={[s.cellText, { color: colors.text, fontSize: 11, textAlign: "center" }]}>
                            {assigneeName}
                        </Text>
                    )}
                </View>
                <View style={[s.cell, s.colBorder, { width: PROGRESS_W, justifyContent: "center", borderLeftColor: colors.border + "22" }]}>
                    {!isProject && !isEmpty && (
                        <View style={[s.progressPill, { backgroundColor: colors.border + "30" }]}>
                            <Text style={[s.progressPillText, { color: progress === 100 ? colors.statusCompleted : colors.textDim }]}>
                                {progress}%
                            </Text>
                        </View>
                    )}
                </View>
                <View style={[s.cell, s.colBorder, { width: STATUS_W, paddingHorizontal: 6, justifyContent: "center", borderLeftColor: colors.border + "22" }]}>
                    {!isProject && !isEmpty && !hasSubtasks && (
                        <StatusChip kind={statusKind} label={statusLabel} size="sm" style={s.statusChip} />
                    )}
                </View>
                <View style={[s.cell, s.colBorder, { width: DAYS_W, justifyContent: "center", borderLeftColor: colors.border + "22" }]}>
                    {!isProject && !isEmpty && !hasSubtasks && (
                        <Text style={[s.cellText, { color: colors.text, fontSize: 11 }]}>{duration}</Text>
                    )}
                </View>
                <View style={[s.cell, s.colBorder, { width: DATES_W, paddingHorizontal: 8, borderLeftColor: colors.border + "22" }]}>
                    {!isProject && !isEmpty && !hasSubtasks && (
                        <Text numberOfLines={1} style={[s.cellText, { color: colors.text, fontSize: 11 }]}>
                            {datesText}
                        </Text>
                    )}
                </View>

                {/* 6. TIMELINE (bar + today marker share the same horizontal scroll) */}
                <View style={{ width: timelineWidth, height: ROW_H, position: "relative" }}>
                    {barPos && task && (
                        <MobileGanttBar
                            task={task}
                            leftPercent={barPos.left}
                            widthPercent={barPos.width}
                            totalWidth={timelineWidth}
                            isSubtask={isSubtask}
                            onPress={() => navigation.navigate("TaskDetail", { taskId: task.id, taskName: task.name })}
                            progress={progress}
                            delay={delay}
                            dayWidth={DAY_W}
                            startDate={dates.start}
                            endDate={dates.end}
                            canEdit={canEdit}
                            workspaceId={activeWorkspace?.id}
                            projectId={task.projectId || projectId}
                            onDatesChanged={handleDatesChanged}
                        />
                    )}
                </View>
            </View>
        );
    };


    // ── 7. Early-return states ──────────────────────────────────────────────
    if (loading && tasks.length === 0) {
        return <ListSkeleton rows={7} showAvatar={false} />;
    }

    if (!loading && tasks.length === 0) {
        return (
            <View style={[s.center, { padding: 32 }]}>
                <Ionicons name="calendar-outline" size={52} color={colors.textDim} />
                <Text style={[s.emptyTitle, { color: colors.text }]}>No Tasks Yet</Text>
                <Text style={[s.emptySub, { color: colors.textDim }]}>
                    Create tasks with start and due dates to see them on the Gantt chart.
                </Text>
            </View>
        );
    }

    // ── 7. Main render ──────────────────────────────────────────────────────
    return (
        <View style={[s.root, { backgroundColor: colors.background }]}>
            {/* Card container — same rounded/bordered/soft-shadow language as
                the app's other surfaces (see ProjectKanban's column card) */}
            <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <ScrollView
                    ref={timelineScrollRef}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    bounces={false}
                    nestedScrollEnabled={true}
                    overScrollMode="never"
                >
                    <View style={{ width: TOTAL_TABLE_W + timelineWidth }}>
                        {/* Header */}
                        <View style={[s.headerRow, { height: HEADER_H, borderBottomColor: colors.border, backgroundColor: colors.surfaceHighlight }]}>
                            {/* Sidebar column titles — spans the full two-row header height, same
                                order as the body rows. Width is explicit (matching s.row below)
                                so Yoga can't under-size this wrapper and clip the labels. */}
                            <View style={{ flexDirection: "row", height: "100%", width: TOTAL_TABLE_W }}>
                                <View style={[s.cell, s.headerCellCenter, { width: NAME_W }]}>
                                    <Text numberOfLines={1} style={[s.headerText, { color: colors.primary }]}>Task Name</Text>
                                </View>
                                <View style={[s.cell, s.colBorder, s.headerCellCenter, { width: ASSIGNEE_W, borderLeftColor: colors.border }]}>
                                    <Text numberOfLines={1} style={[s.headerText, { color: colors.textMuted }]}>Assignee</Text>
                                </View>
                                <View style={[s.cell, s.colBorder, s.headerCellCenter, { width: PROGRESS_W, borderLeftColor: colors.border }]}>
                                    <Text numberOfLines={1} style={[s.headerText, { color: colors.textMuted }]}>Progress</Text>
                                </View>
                                <View style={[s.cell, s.colBorder, s.headerCellCenter, { width: STATUS_W, borderLeftColor: colors.border }]}>
                                    <Text numberOfLines={1} style={[s.headerText, { color: colors.textMuted }]}>Status</Text>
                                </View>
                                <View style={[s.cell, s.colBorder, s.headerCellCenter, { width: DAYS_W, borderLeftColor: colors.border }]}>
                                    <Text numberOfLines={1} style={[s.headerText, { color: colors.textMuted }]}>Days</Text>
                                </View>
                                <View style={[s.cell, s.colBorder, s.headerCellCenter, { width: DATES_W, borderLeftColor: colors.border }]}>
                                    <Text numberOfLines={1} style={[s.headerText, { color: colors.textMuted }]}>Dates</Text>
                                </View>
                            </View>

                            {/* Timeline header: month band + day-number row + "Today" marker */}
                            <View style={{ width: timelineWidth, height: "100%", position: "relative" }}>
                                <View style={{ height: MONTH_ROW_H, flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
                                    {monthGroups.map((group, i) => (
                                        <View
                                            key={`${group.label}-${i}`}
                                            style={[
                                                s.monthCell,
                                                { width: group.days * DAY_W, borderLeftColor: colors.border }
                                            ]}
                                        >
                                            <Text numberOfLines={1} style={[s.headerText, { color: colors.textMuted }]}>
                                                {group.label}
                                            </Text>
                                        </View>
                                    ))}
                                </View>
                                <View style={{ height: DAY_ROW_H, flexDirection: "row" }}>
                                    {dayColumns.map((col, i) => (
                                        <View
                                            key={i}
                                            style={[
                                                s.dayCell,
                                                {
                                                    width: DAY_W,
                                                    borderLeftColor: colors.border + "88",
                                                    backgroundColor: col.isToday ? colors.primary + "26" : "transparent",
                                                }
                                            ]}
                                        >
                                            <Text
                                                style={[
                                                    s.dayText,
                                                    { color: col.isToday ? colors.primary : colors.textMuted, fontFamily: col.isToday ? FONTS.extrabold : FONTS.medium }
                                                ]}
                                            >
                                                {col.label}
                                            </Text>
                                        </View>
                                    ))}
                                </View>
                                {todayOffset !== null && (
                                    <View pointerEvents="none" style={[s.todayBadgeWrap, { left: todayOffset }]}>
                                        <View style={[s.todayBadge, { backgroundColor: colors.primary }, ELEVATION.sm]}>
                                            <Text style={[s.todayBadgeText, { color: colors.textInverse }]}>Today</Text>
                                        </View>
                                    </View>
                                )}
                            </View>
                        </View>

                        {/* Body */}
                        <ScrollView
                            showsVerticalScrollIndicator={false}
                            contentContainerStyle={{ paddingBottom: SPACING.bottomTabBar }}
                            refreshControl={
                                <RefreshControl refreshing={false} onRefresh={() => { haptics.light(); refreshData(); }} tintColor={colors.primary} />
                            }
                        >
                            <View style={{ position: "relative" }}>
                                {/* "Today" vertical line — spans every row so it's unmistakable in both themes */}
                                {todayOffset !== null && (
                                    <View
                                        pointerEvents="none"
                                        style={[
                                            s.todayLine,
                                            { left: TOTAL_TABLE_W + todayOffset, backgroundColor: colors.primary }
                                        ]}
                                    />
                                )}
                                {/* Dependency connector lines between subtasks */}
                                <View
                                    pointerEvents="none"
                                    style={{ position: "absolute", top: 0, left: TOTAL_TABLE_W, width: timelineWidth, height: flatItems.length * ROW_H }}
                                >
                                    <DependencyLines
                                        bars={dependencyBars}
                                        timelineWidth={timelineWidth}
                                        bodyHeight={flatItems.length * ROW_H}
                                    />
                                </View>
                                {flatItems.map(renderRow)}
                            </View>
                        </ScrollView>
                    </View>
                </ScrollView>

                {/* Legend — status colors mirror StatusChip elsewhere in the app,
                    since bars are colored by status (not by hierarchy level).
                    Scrolls horizontally in one line instead of wrapping so it
                    doesn't eat vertical space on narrow phones. */}
                <View style={[s.legendRow, { borderTopColor: colors.border, backgroundColor: colors.surfaceHighlight }]}>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={s.legendScrollContent}
                    >
                        {([
                            ["To Do", colors.statusTodo],
                            ["In Progress", colors.statusInProgress],
                            ["Review", colors.statusReview],
                            ["Hold", colors.statusHold],
                            ["Completed", colors.statusCompleted],
                            ["Cancelled", colors.statusCancelled],
                        ] as const).map(([label, color]) => (
                            <View key={label} style={s.legendItem}>
                                <View style={[s.legendDotRound, { backgroundColor: color }]} />
                                <Text style={[s.legendText, { color: colors.textMuted }]}>{label}</Text>
                            </View>
                        ))}
                        <View style={s.legendItem}>
                            <View style={[s.legendTodayLine, { backgroundColor: colors.primary }]} />
                            <Text style={[s.legendText, { color: colors.textMuted }]}>Today</Text>
                        </View>
                    </ScrollView>
                </View>
            </View>
        </View>
    );
}


// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    root: { flex: 1 },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },

    // Card container — matches ProjectKanban's column card language
    // (rounded, bordered, soft shadow) so the Gantt reads as one app.
    card: {
        flex: 1,
        margin: SPACING.md,
        borderRadius: BORDER_RADIUS.lg,
        borderWidth: 1,
        overflow: "hidden",
        ...ELEVATION.sm,
    },

    // Header logic
    headerRow: {
        flexDirection: "row",
        alignItems: "center",
        borderBottomWidth: 1,
    },
    headerText: { fontSize: 9.5, fontFamily: FONTS.bold, letterSpacing: 0.4, textTransform: "uppercase" },
    headerCellCenter: { justifyContent: "center" },

    // Row logic
    row: {
        flexDirection: "row",
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    cell: {
        flexDirection: "row",
        alignItems: "center",
        height: "100%",
    },
    cellText: { fontSize: 12, lineHeight: 16 },

    // Subtask-count pill next to the task name (mirrors web's task-row.tsx badge)
    countPill: {
        marginLeft: 6,
        paddingHorizontal: 6,
        paddingVertical: 1,
        borderRadius: 8,
    },
    countPillText: { fontSize: 10, fontFamily: FONTS.medium },

    // Progress % pill in the Progress column (mirrors web's progress badge)
    progressPill: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
    },
    progressPillText: { fontSize: 10, fontFamily: FONTS.bold },

    // Sidebar detail-column border (Assignee/Progress/Status/Days/Dates)
    colBorder: {
        borderLeftWidth: StyleSheet.hairlineWidth,
    },

    // StatusChip defaults to alignSelf:"flex-start" (for inline text-flow use
    // elsewhere) — override so it centers vertically inside the fixed-height
    // row cell instead of pinning to the top.
    statusChip: { alignSelf: "center" },

    // Timeline header (month ruler)
    monthCell: {
        justifyContent: "center",
        paddingLeft: 8,
        borderLeftWidth: StyleSheet.hairlineWidth,
    },
    dayCell: {
        alignItems: "center",
        justifyContent: "center",
        borderLeftWidth: StyleSheet.hairlineWidth,
    },
    dayText: { fontSize: 10 },

    // "Today" marker — line spans the full body height; badge sits in the header.
    todayLine: {
        position: "absolute",
        top: 0,
        bottom: 0,
        width: 2,
        zIndex: 5,
    },
    todayBadgeWrap: {
        position: "absolute",
        top: MONTH_ROW_H + 3,
        alignItems: "center",
        transform: [{ translateX: -18 }],
    },
    todayBadge: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
    },
    todayBadgeText: {
        fontSize: 8,
        fontFamily: FONTS.extrabold,
        letterSpacing: 0.3,
    },

    // Empty state
    emptyTitle: { fontSize: 17, fontFamily: FONTS.bold, marginTop: 16, textAlign: "center" },
    emptySub: { fontSize: 13, textAlign: "center", marginTop: 8, lineHeight: 20 },

    // Legend
    legendRow: {
        paddingVertical: 8,
        borderTopWidth: StyleSheet.hairlineWidth,
    },
    legendScrollContent: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 12 },
    legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
    legendDotRound: { width: 10, height: 10, borderRadius: 5 },
    legendTodayLine: { width: 2, height: 14, borderRadius: 1 },
    legendText: { fontSize: 11, fontFamily: FONTS.medium },
});

