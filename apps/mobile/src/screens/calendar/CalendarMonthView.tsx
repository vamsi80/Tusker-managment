import React, { useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { SPACING, BORDER_RADIUS, FONTS } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import { useResponsive } from "../../hooks/useResponsive";
import { Meeting } from "../../types";
import { calendarDayKey, addDateOnlyDays } from "../../utils/calendarDate";
import type { CalendarCtx } from "./CalendarScreen";

const DAYS_OF_WEEK = ["S", "M", "T", "W", "T", "F", "S"];
// A grid sized off the raw screen width blows up into huge, sparse cells on a
// tablet (a 2560px-wide screen would give ~360px cells). Cap the grid itself
// so cells stay a sane, finger-sized target and center the leftover space.
const CALENDAR_MAX_WIDTH = 640;

interface DayEntry {
    meetings: Meeting[];
    tasks: number;
    holidays: number;
    leaves: number;
}

export default function CalendarMonthView({ ctx }: { ctx: CalendarCtx }) {
    const { colors } = useTheme();
    const { width: windowWidth, isCompact } = useResponsive();
    // The screen already gives every row a SPACING.lg margin (scrollContent's
    // paddingHorizontal) — size the card to that same available width instead
    // of the raw window width, so it lines up with the rows above it on every
    // device instead of bleeding edge-to-edge on narrower phones. On compact
    // phones (<380dp wide, per useResponsive) shrink the card's own internal
    // padding too, so cells don't get squeezed below a usable touch target.
    const cardPadding = isCompact ? SPACING.md : SPACING.lg;
    const availableWidth = windowWidth - SPACING.lg * 2;
    const gridWidth = Math.min(availableWidth, CALENDAR_MAX_WIDTH);
    // Only used for the cell's height (row rhythm scales with available
    // width) — actual column width is left to flexbox below (flex: 1 on each
    // of the 7 cells), since a manually computed pixel width doesn't always
    // sum back to exactly the container's content width once Yoga rounds
    // each cell to a physical pixel (density-dependent), and being even one
    // pixel over silently wraps the 7th cell onto the next row.
    const CELL_HEIGHT = (gridWidth - cardPadding * 2 - 2) / 7 + 8;
    const {
        selectedDate,
        meetings,
        taskDeadlines,
        publicHolidays,
        leaves,
        activeLayers,
        filterType,
        searchQuery,
        openDayItems,
    } = ctx;

    const selectedKey = calendarDayKey(selectedDate);

    const { days } = useMemo(() => {
        const year = selectedDate.getFullYear();
        const month = selectedDate.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const startingDayIndex = firstDay.getDay();
        const totalDays = lastDay.getDate();
        const todayKey = calendarDayKey(new Date());

        const arr: Array<{ date: Date; isCurrentMonth: boolean; isToday: boolean; dateKey: string }> = [];

        const prevMonthLastDay = new Date(year, month, 0).getDate();
        for (let i = startingDayIndex - 1; i >= 0; i--) {
            const d = new Date(year, month - 1, prevMonthLastDay - i);
            const dateKey = calendarDayKey(d);
            arr.push({ date: d, isCurrentMonth: false, isToday: dateKey === todayKey, dateKey });
        }
        for (let i = 1; i <= totalDays; i++) {
            const d = new Date(year, month, i);
            const dateKey = calendarDayKey(d);
            arr.push({ date: d, isCurrentMonth: true, isToday: dateKey === todayKey, dateKey });
        }
        const remaining = (7 - (arr.length % 7)) % 7;
        for (let i = 1; i <= remaining; i++) {
            const d = new Date(year, month + 1, i);
            const dateKey = calendarDayKey(d);
            arr.push({ date: d, isCurrentMonth: false, isToday: dateKey === todayKey, dateKey });
        }
        return { days: arr };
    }, [selectedDate]);

    const weeks = useMemo(() => {
        const chunks: typeof days[number][][] = [];
        for (let i = 0; i < days.length; i += 7) chunks.push(days.slice(i, i + 7));
        return chunks;
    }, [days]);

    const filteredMeetings = useMemo(() => {
        return meetings.filter((m) => {
            if (filterType !== "ALL" && m.type !== filterType) return false;
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const matches =
                    m.title.toLowerCase().includes(q) ||
                    m.description?.toLowerCase().includes(q) ||
                    m.location?.toLowerCase().includes(q);
                if (!matches) return false;
            }
            return true;
        });
    }, [meetings, filterType, searchQuery]);

    const itemsByDate = useMemo(() => {
        const map = new Map<string, DayEntry>();
        const getEntry = (key: string) => {
            if (!map.has(key)) map.set(key, { meetings: [], tasks: 0, holidays: 0, leaves: 0 });
            return map.get(key)!;
        };

        if (activeLayers.meetings) {
            filteredMeetings.forEach((m) => {
                getEntry(calendarDayKey(m.startTime)).meetings.push(m);
            });
        }
        if (activeLayers.tasks) {
            taskDeadlines.forEach((t) => {
                getEntry(calendarDayKey(t.date)).tasks += 1;
            });
        }
        if (activeLayers.holidays) {
            publicHolidays.forEach((h) => {
                getEntry(calendarDayKey(h.date)).holidays += 1;
            });
        }
        if (activeLayers.leaves) {
            leaves.forEach((l) => {
                const start = new Date(l.startDate);
                const end = new Date(l.endDate);
                for (let d = start; d <= end; d = addDateOnlyDays(d, 1)) {
                    getEntry(calendarDayKey(d)).leaves += 1;
                }
            });
        }
        return map;
    }, [filteredMeetings, taskDeadlines, publicHolidays, leaves, activeLayers]);

    return (
        <View
            style={[
                styles.container,
                {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    width: gridWidth,
                    paddingHorizontal: cardPadding,
                    paddingTop: SPACING.sm,
                    alignSelf: "center",
                },
            ]}
        >
            <View style={[styles.weekHeader, { borderBottomColor: colors.border }]}>
                {DAYS_OF_WEEK.map((d, i) => (
                    <Text key={i} style={[styles.weekHeaderText, { color: colors.textDim }]}>
                        {d}
                    </Text>
                ))}
            </View>

            {weeks.map((week, weekIdx) => (
                <View key={weekIdx} style={styles.weekRow}>
                    {week.map((day, idx) => {
                        const entry = itemsByDate.get(day.dateKey);
                        const meetingCount = entry?.meetings.length ?? 0;
                        const hasHoliday = (entry?.holidays ?? 0) > 0;
                        const hasLeave = (entry?.leaves ?? 0) > 0;
                        const hasTask = (entry?.tasks ?? 0) > 0;
                        const hasAny = meetingCount > 0 || hasHoliday || hasLeave || hasTask;
                        const isSelected = day.dateKey === selectedKey;

                        return (
                            <TouchableOpacity
                                key={idx}
                                activeOpacity={0.6}
                                onPress={() => openDayItems(day.date)}
                                style={[
                                    styles.cell,
                                    {
                                        height: CELL_HEIGHT,
                                        opacity: day.isCurrentMonth ? 1 : 0.35,
                                    },
                                ]}
                            >
                                <View
                                    style={[
                                        styles.dayCircle,
                                        isSelected && { backgroundColor: colors.primary },
                                        !isSelected && day.isToday && { borderWidth: 1.5, borderColor: colors.primary },
                                    ]}
                                >
                                    <Text
                                        style={[
                                            styles.dayNum,
                                            { color: isSelected ? "#fff" : day.isToday ? colors.primary : colors.text },
                                        ]}
                                    >
                                        {day.date.getDate()}
                                    </Text>
                                </View>

                                {hasAny && (
                                    <View style={styles.dotsRow}>
                                        {hasHoliday && <View style={[styles.dot, { backgroundColor: "#f43f5e" }]} />}
                                        {hasLeave && <View style={[styles.dot, { backgroundColor: "#a855f7" }]} />}
                                        {meetingCount > 0 && <View style={[styles.dot, { backgroundColor: colors.primary }]} />}
                                        {hasTask && <View style={[styles.dot, { backgroundColor: "#64748b" }]} />}
                                    </View>
                                )}
                            </TouchableOpacity>
                        );
                    })}
                </View>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { borderWidth: 1, borderRadius: BORDER_RADIUS.lg, overflow: "hidden" },
    weekHeader: { flexDirection: "row", borderBottomWidth: 1, paddingVertical: 8 },
    weekHeaderText: { flex: 1, fontSize: 11, fontFamily: FONTS.bold, textAlign: "center" },
    weekRow: { flexDirection: "row" },
    cell: { flex: 1, alignItems: "center", paddingTop: 6, gap: 4 },
    dayCircle: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
    dayNum: { fontSize: 13, fontFamily: FONTS.semibold },
    dotsRow: { flexDirection: "row", gap: 3, height: 5 },
    dot: { width: 5, height: 5, borderRadius: 2.5 },
});
