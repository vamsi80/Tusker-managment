import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    TextInput,
    RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { SPACING, BORDER_RADIUS, FONTS } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import { useWorkspace } from "../../context/WorkspaceContext";
import { useToast } from "../../context/ToastContext";
import { StatsSkeleton } from "../../components/ScreenSkeleton";
import { getCachedSession, getCalendarData } from "../../services/api";
import { PusherClient } from "../../services/PusherClient";
import { haptics } from "../../services/haptics";
import { CalendarLayerData, Meeting } from "../../types";

import CalendarMonthView from "./CalendarMonthView";
import CalendarWeekView from "./CalendarWeekView";
import CalendarAgendaView from "./CalendarAgendaView";
import DayItemsSheet from "./DayItemsSheet";
import ScheduleMeetingSheet from "./ScheduleMeetingSheet";
import MeetingDetailsSheet from "./MeetingDetailsSheet";

type CalendarViewMode = "month" | "week" | "agenda";

const TYPE_FILTERS: { value: string; label: string }[] = [
    { value: "ALL", label: "All Types" },
    { value: "INTERNAL", label: "Internal" },
    { value: "CLIENT", label: "Client" },
    { value: "PROJECT_REVIEW", label: "Review" },
    { value: "ONE_ON_ONE", label: "1-on-1" },
    { value: "GENERAL", label: "General" },
];

export interface CalendarCtx {
    selectedDate: Date;
    meetings: Meeting[];
    taskDeadlines: CalendarLayerData["taskDeadlines"];
    publicHolidays: CalendarLayerData["publicHolidays"];
    leaves: CalendarLayerData["leaves"];
    activeLayers: { meetings: boolean; tasks: boolean; holidays: boolean; leaves: boolean };
    filterType: string;
    searchQuery: string;
    openDetails: (meeting: Meeting) => void;
    openSchedule: (defaults?: { date?: Date; time?: string }) => void;
    openTask: (task: { id: string; title: string }) => void;
    openDayItems: (date: Date) => void;
}

export default function CalendarScreen({ navigation }: any) {
    const { colors } = useTheme();
    const { activeWorkspace } = useWorkspace();
    const toast = useToast();
    const workspaceId = activeWorkspace?.id;

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [currentUserId, setCurrentUserId] = useState<string | undefined>();

    const [data, setData] = useState<CalendarLayerData>({ meetings: [], taskDeadlines: [], publicHolidays: [], leaves: [] });
    const [activeView, setActiveView] = useState<CalendarViewMode>("month");
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [activeLayers, setActiveLayers] = useState({ meetings: true, tasks: true, holidays: true, leaves: true });
    const [filterType, setFilterType] = useState("ALL");
    const [showTypeFilter, setShowTypeFilter] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");

    const [dayItemsDate, setDayItemsDate] = useState<Date | null>(null);
    const [scheduleOpen, setScheduleOpen] = useState(false);
    const [scheduleDefaults, setScheduleDefaults] = useState<{ date?: Date; time?: string } | null>(null);
    const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);

    const loadData = useCallback(async () => {
        if (!workspaceId) return;
        try {
            const result = await getCalendarData(workspaceId);
            setData(result);
            setLoadError(null);
        } catch (error: any) {
            console.error("[CalendarScreen] loadData error:", error);
            const message = error?.message || "Failed to load calendar";
            setLoadError(message);
            toast.error(message);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [workspaceId, toast]);

    useEffect(() => {
        getCachedSession().then((s) => setCurrentUserId(s?.user?.id));
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Realtime: mirrors web's window "realtime-meeting-sync"/"realtime-task-sync"
    // listeners, sourced from the same team-{workspaceId} Pusher channel and
    // meeting_update/task_update events (packages/core/src/lib/realtime.ts).
    const pusherRef = useRef<PusherClient | null>(null);
    useEffect(() => {
        const pusherKey = process.env.EXPO_PUBLIC_PUSHER_KEY;
        const pusherCluster = process.env.EXPO_PUBLIC_PUSHER_CLUSTER;
        if (!pusherKey || !pusherCluster || !workspaceId) return;

        const pusher = new PusherClient(pusherKey, { cluster: pusherCluster });
        pusherRef.current = pusher;
        const channel = pusher.subscribe(`team-${workspaceId}`);

        channel.bind("meeting_update", (evt: any) => {
            const action = (evt?.type || evt?.action || "").toUpperCase();
            const payload = evt?.payload || evt?.record || evt?.newData;
            if (!payload) return;
            if (action === "CREATE") {
                setData((d) => ({ ...d, meetings: [payload, ...d.meetings.filter((m) => m.id !== payload.id)] }));
            } else if (action === "DELETE") {
                const id = payload.id || evt?.meetingId;
                if (id) {
                    setData((d) => ({ ...d, meetings: d.meetings.filter((m) => m.id !== id) }));
                    setSelectedMeeting((m) => (m?.id === id ? null : m));
                }
            } else if (action === "UPDATE" || action === "RSVP_UPDATE") {
                setData((d) => ({ ...d, meetings: d.meetings.map((m) => (m.id === payload.id ? { ...m, ...payload } : m)) }));
                setSelectedMeeting((m) => (m?.id === payload.id ? { ...m, ...payload } : m));
            }
        });
        channel.bind("task_update", () => loadData());

        return () => {
            pusher.unsubscribe(`team-${workspaceId}`);
            pusher.disconnect();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [workspaceId]);

    const onRefresh = () => {
        setRefreshing(true);
        loadData();
    };

    const shiftDate = (unit: "day" | "month", amount: number) => {
        haptics.selection();
        const next = new Date(selectedDate);
        if (unit === "month") next.setMonth(next.getMonth() + amount);
        else next.setDate(next.getDate() + amount);
        setSelectedDate(next);
    };
    const handlePrevDay = () => shiftDate("day", -1);
    const handleNextDay = () => shiftDate("day", 1);
    const handlePrevMonth = () => shiftDate("month", -1);
    const handleNextMonth = () => shiftDate("month", 1);
    const handleToday = () => {
        haptics.selection();
        setSelectedDate(new Date());
    };

    const toggleLayer = (layer: keyof typeof activeLayers) => {
        setActiveLayers((prev) => ({ ...prev, [layer]: !prev[layer] }));
    };

    const ctx: CalendarCtx = useMemo(
        () => ({
            selectedDate,
            meetings: data.meetings,
            taskDeadlines: data.taskDeadlines,
            publicHolidays: data.publicHolidays,
            leaves: data.leaves,
            activeLayers,
            filterType,
            searchQuery,
            openDetails: (m) => setSelectedMeeting(m),
            openSchedule: (defaults) => {
                setScheduleDefaults(defaults ?? { date: selectedDate });
                setScheduleOpen(true);
            },
            openTask: (task) => {
                navigation.navigate("TaskDetail", { taskId: task.id, taskName: task.title.replace(/^Task Due: /, "") });
            },
            openDayItems: (date) => setDayItemsDate(date),
        }),
        [selectedDate, data, activeLayers, filterType, searchQuery, navigation]
    );

    const headerTitle = selectedDate.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" });

    if (loading) {
        return <StatsSkeleton tiles={2} rows={4} />;
    }

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top"]}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
                    <Ionicons name="chevron-back" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.title, { color: colors.text }]}>Calendar</Text>
                <TouchableOpacity
                    style={[styles.addButton, { backgroundColor: colors.primary }]}
                    onPress={() => {
                        setScheduleDefaults({ date: selectedDate });
                        setScheduleOpen(true);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Schedule meeting"
                >
                    <Ionicons name="add" size={24} color="#fff" />
                </TouchableOpacity>
            </View>

            <ScrollView
                contentContainerStyle={styles.scrollContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
                showsVerticalScrollIndicator={false}
            >
                {loadError && (
                    <View style={[styles.errorBanner, { backgroundColor: colors.error + "14", borderColor: colors.error + "40" }]}>
                        <Ionicons name="alert-circle" size={16} color={colors.error} />
                        <Text style={[styles.errorBannerText, { color: colors.error }]} numberOfLines={2}>
                            {loadError}
                        </Text>
                        <TouchableOpacity onPress={onRefresh} style={styles.errorBannerRetry}>
                            <Text style={[styles.errorBannerRetryText, { color: colors.error }]}>Retry</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Date navigation — double arrows jump by month, single arrows by day */}
                <View style={styles.navRow}>
                    <TouchableOpacity style={[styles.navBtn, styles.doubleNavBtn, { borderColor: colors.border }]} onPress={handlePrevMonth} accessibilityLabel="Previous month">
                        <Ionicons name="chevron-back" size={16} color={colors.text} />
                        <Ionicons name="chevron-back" size={16} color={colors.text} style={styles.doubleChevronOverlap} />
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.navBtn, { borderColor: colors.border }]} onPress={handlePrevDay} accessibilityLabel="Previous day">
                        <Ionicons name="chevron-back" size={16} color={colors.text} />
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.dateBar, { borderColor: colors.border, backgroundColor: colors.surfaceHighlight }]}
                        onPress={handleToday}
                        accessibilityLabel="Jump to today"
                    >
                        <Text style={[styles.dateBarText, { color: colors.text }]} numberOfLines={1}>
                            {headerTitle}
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={[styles.navBtn, { borderColor: colors.border }]} onPress={handleNextDay} accessibilityLabel="Next day">
                        <Ionicons name="chevron-forward" size={16} color={colors.text} />
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.navBtn, styles.doubleNavBtn, { borderColor: colors.border }]} onPress={handleNextMonth} accessibilityLabel="Next month">
                        <Ionicons name="chevron-forward" size={16} color={colors.text} />
                        <Ionicons name="chevron-forward" size={16} color={colors.text} style={styles.doubleChevronOverlap} />
                    </TouchableOpacity>
                </View>

                {/* View switcher */}
                <View style={[styles.viewSwitcher, { backgroundColor: colors.surfaceHighlight }]}>
                    {(["month", "week", "agenda"] as CalendarViewMode[]).map((v) => (
                        <TouchableOpacity
                            key={v}
                            style={[styles.viewSwitchItem, activeView === v && { backgroundColor: colors.surface }]}
                            onPress={() => setActiveView(v)}
                        >
                            <Text style={[styles.viewSwitchText, { color: activeView === v ? colors.text : colors.textDim }]}>
                                {v.charAt(0).toUpperCase() + v.slice(1)}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Search + type filter */}
                <View style={styles.searchFilterRow}>
                    <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <Ionicons name="search" size={15} color={colors.textDim} />
                        <TextInput
                            style={[styles.searchInput, { color: colors.text }]}
                            placeholder="Search meetings..."
                            placeholderTextColor={colors.textDim}
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                        />
                    </View>
                    <TouchableOpacity
                        style={[styles.filterBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
                        onPress={() => setShowTypeFilter((v) => !v)}
                    >
                        <Ionicons name="filter" size={14} color={colors.text} />
                        <Text style={[styles.filterBtnText, { color: colors.text }]}>
                            {TYPE_FILTERS.find((t) => t.value === filterType)?.label}
                        </Text>
                    </TouchableOpacity>
                </View>

                {showTypeFilter && (
                    <View style={styles.typeFilterRow}>
                        {TYPE_FILTERS.map((t) => (
                            <TouchableOpacity
                                key={t.value}
                                onPress={() => {
                                    setFilterType(t.value);
                                    setShowTypeFilter(false);
                                }}
                                style={[
                                    styles.typeFilterChip,
                                    { borderColor: colors.border },
                                    filterType === t.value && { backgroundColor: colors.primary, borderColor: colors.primary },
                                ]}
                            >
                                <Text style={[styles.typeFilterChipText, { color: filterType === t.value ? "#fff" : colors.text }]}>
                                    {t.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                )}

                {/* Layer toggles */}
                <View style={styles.layersRow}>
                    {[
                        { key: "meetings" as const, label: "Meetings", icon: "videocam-outline" as const, tint: colors.primary, count: data.meetings.length },
                        { key: "tasks" as const, label: "Tasks", icon: "checkbox-outline" as const, tint: "#64748b", count: data.taskDeadlines.length },
                        { key: "holidays" as const, label: "Holidays", icon: "sparkles-outline" as const, tint: "#f43f5e", count: data.publicHolidays.length },
                        { key: "leaves" as const, label: "Leaves", icon: "person-remove-outline" as const, tint: "#a855f7", count: data.leaves.length },
                    ].map((l) => {
                        const active = activeLayers[l.key];
                        return (
                            <TouchableOpacity
                                key={l.key}
                                onPress={() => toggleLayer(l.key)}
                                style={[
                                    styles.layerChip,
                                    { borderColor: active ? l.tint + "40" : "transparent", backgroundColor: active ? l.tint + "14" : colors.surfaceHighlight },
                                ]}
                            >
                                <Ionicons name={l.icon} size={9} color={active ? l.tint : colors.textDim} />
                                <Text style={[styles.layerChipText, { color: active ? l.tint : colors.textDim }]} numberOfLines={1}>
                                    {l.label}
                                </Text>
                                <View style={[styles.layerCount, { backgroundColor: active ? l.tint + "22" : colors.border }]}>
                                    <Text style={[styles.layerCountText, { color: active ? l.tint : colors.textDim }]}>{l.count}</Text>
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                {/* Main view */}
                <View style={{ marginTop: SPACING.md }}>
                    {activeView === "month" && <CalendarMonthView ctx={ctx} />}
                    {activeView === "week" && <CalendarWeekView ctx={ctx} />}
                    {activeView === "agenda" && <CalendarAgendaView ctx={ctx} />}
                </View>

                <View style={{ height: SPACING.xxl }} />
            </ScrollView>

            <DayItemsSheet ctx={ctx} date={dayItemsDate} onClose={() => setDayItemsDate(null)} />

            {workspaceId && (
                <ScheduleMeetingSheet
                    visible={scheduleOpen}
                    workspaceId={workspaceId}
                    defaults={scheduleDefaults}
                    meetings={data.meetings}
                    onClose={() => setScheduleOpen(false)}
                    onCreated={(meeting) => setData((d) => ({ ...d, meetings: [meeting, ...d.meetings] }))}
                />
            )}

            {workspaceId && (
                <MeetingDetailsSheet
                    meeting={selectedMeeting}
                    workspaceId={workspaceId}
                    currentUserId={currentUserId}
                    onClose={() => setSelectedMeeting(null)}
                    onUpdated={(updated) => {
                        setData((d) => ({ ...d, meetings: d.meetings.map((m) => (m.id === updated.id ? updated : m)) }));
                        setSelectedMeeting(updated);
                    }}
                    onDeleted={(id) => setData((d) => ({ ...d, meetings: d.meetings.filter((m) => m.id !== id) }))}
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: SPACING.lg },
    backBtn: { width: 40, height: 40, justifyContent: "center" },
    title: { fontSize: 20, fontFamily: FONTS.bold },
    addButton: { width: 40, height: 40, borderRadius: 20, justifyContent: "center", alignItems: "center" },
    scrollContent: { paddingHorizontal: SPACING.lg, paddingBottom: 20 },

    errorBanner: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: BORDER_RADIUS.md, padding: SPACING.sm, marginBottom: SPACING.md },
    errorBannerText: { flex: 1, fontSize: 12, fontFamily: FONTS.semibold },
    errorBannerRetry: { paddingHorizontal: 8, paddingVertical: 4 },
    errorBannerRetryText: { fontSize: 12, fontFamily: FONTS.bold },

    navRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: SPACING.md },
    navBtn: { width: 30, height: 34, borderRadius: BORDER_RADIUS.sm, borderWidth: 1, alignItems: "center", justifyContent: "center" },
    doubleNavBtn: { flexDirection: "row" },
    doubleChevronOverlap: { marginLeft: -10 },
    dateBar: { flex: 1, height: 34, borderRadius: BORDER_RADIUS.sm, borderWidth: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
    dateBarText: { fontSize: 13, fontFamily: FONTS.bold },

    viewSwitcher: { flexDirection: "row", borderRadius: BORDER_RADIUS.md, padding: 3, marginBottom: SPACING.md },
    viewSwitchItem: { flex: 1, alignItems: "center", paddingVertical: 7, borderRadius: BORDER_RADIUS.sm },
    viewSwitchText: { fontSize: 12, fontFamily: FONTS.bold },

    searchFilterRow: { flexDirection: "row", gap: 8, marginBottom: SPACING.sm },
    searchBox: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: BORDER_RADIUS.md, paddingHorizontal: 10, height: 38 },
    searchInput: { flex: 1, fontSize: 13 },
    filterBtn: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: BORDER_RADIUS.md, paddingHorizontal: 10, height: 38 },
    filterBtnText: { fontSize: 12, fontFamily: FONTS.semibold },

    typeFilterRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: SPACING.sm },
    typeFilterChip: { borderWidth: 1, borderRadius: BORDER_RADIUS.full, paddingHorizontal: 10, paddingVertical: 5 },
    typeFilterChipText: { fontSize: 11, fontFamily: FONTS.semibold },

    layersRow: { flexDirection: "row", gap: 4, marginBottom: SPACING.xs },
    layerChip: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 2, borderWidth: 1, borderRadius: BORDER_RADIUS.full, paddingHorizontal: 4, paddingVertical: 5 },
    layerChipText: { fontSize: 9, fontFamily: FONTS.semibold },
    layerCount: { borderRadius: BORDER_RADIUS.full, paddingHorizontal: 3, minWidth: 13, alignItems: "center" },
    layerCountText: { fontSize: 8, fontFamily: FONTS.bold },
});
