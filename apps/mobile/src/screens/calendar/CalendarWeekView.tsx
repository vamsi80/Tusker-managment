import React, { useMemo, useRef, useState, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BORDER_RADIUS, FONTS } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import { calendarDayKey } from "../../utils/calendarDate";
import type { CalendarCtx } from "./CalendarScreen";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const HOUR_HEIGHT = 52;
const DEFAULT_SCROLL_HOUR = 8;

export default function CalendarWeekView({ ctx }: { ctx: CalendarCtx }) {
    const { colors } = useTheme();
    const { selectedDate, meetings, openSchedule, openDetails } = ctx;

    const weekDays = useMemo(() => {
        const curr = new Date(selectedDate);
        const dayOfWeek = curr.getDay();
        const startOfWeek = new Date(curr);
        startOfWeek.setDate(curr.getDate() - dayOfWeek);
        startOfWeek.setHours(0, 0, 0, 0);
        const todayKey = calendarDayKey(new Date());

        return Array.from({ length: 7 }, (_, i) => {
            const d = new Date(startOfWeek);
            d.setDate(startOfWeek.getDate() + i);
            const dateKey = calendarDayKey(d);
            return {
                date: d,
                dateKey,
                dayName: d.toLocaleDateString("en-US", { weekday: "short" }),
                dayNum: d.getDate(),
                isToday: dateKey === todayKey,
            };
        });
    }, [selectedDate]);

    // Days (within the displayed week) that actually have a meeting — used to
    // pick which day the single-day timeline opens on. Defaulting to "today"
    // unconditionally meant a week with meetings only on, say, Wednesday
    // rendered an empty timeline whenever it was opened on any other day.
    const weekDayKeysWithMeetings = useMemo(() => {
        const set = new Set<string>();
        meetings.forEach((m) => {
            if (m.status !== "CANCELLED") set.add(calendarDayKey(m.startTime));
        });
        return set;
    }, [meetings]);

    const pickDefaultDay = (days: typeof weekDays) => {
        const todayKey = calendarDayKey(new Date());
        const today = days.find((d) => d.dateKey === todayKey);
        if (today && weekDayKeysWithMeetings.has(todayKey)) return todayKey;
        const firstWithMeeting = days.find((d) => weekDayKeysWithMeetings.has(d.dateKey));
        return firstWithMeeting?.dateKey ?? today?.dateKey ?? days[0].dateKey;
    };

    const [activeDay, setActiveDay] = useState(() => pickDefaultDay(weekDays));

    useEffect(() => {
        // Follows selectedDate directly so the single-arrow day nav in
        // CalendarScreen highlights the day it just moved to, instead of
        // being overridden by the "best day with meetings" heuristic (that
        // heuristic only applies to the initial mount, above).
        setActiveDay(calendarDayKey(selectedDate));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedDate]);

    const [currentTime, setCurrentTime] = useState(new Date());
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 60_000);
        return () => clearInterval(timer);
    }, []);

    // weekDays recomputes as soon as selectedDate changes, but activeDay is
    // only resynced by the effect below, which runs a render later — so for
    // one render, activeDay can still be a stale dateKey from the previous
    // week. Fall back to the first day rather than crashing on that render.
    const activeDayInfo = weekDays.find((d) => d.dateKey === activeDay) ?? weekDays[0];

    const dayMeetings = useMemo(() => {
        return meetings
            .filter((m) => m.status !== "CANCELLED" && calendarDayKey(m.startTime) === activeDay)
            .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    }, [meetings, activeDay]);

    const scrollRef = useRef<ScrollView>(null);
    const earliestHour = useMemo(() => {
        const starts = dayMeetings.map((m) => new Date(m.startTime).getHours());
        return starts.length > 0 ? Math.min(...starts) : DEFAULT_SCROLL_HOUR;
    }, [dayMeetings]);

    useEffect(() => {
        const y = Math.max(0, earliestHour - 1) * HOUR_HEIGHT;
        requestAnimationFrame(() => scrollRef.current?.scrollTo({ y, animated: false }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeDay]);

    const currentTimeTop = (currentTime.getHours() * 60 + currentTime.getMinutes()) * (HOUR_HEIGHT / 60);

    return (
        <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {/* Day strip */}
            <View style={[styles.strip, { borderBottomColor: colors.border }]}>
                {weekDays.map((wd) => {
                    const selected = wd.dateKey === activeDay;
                    return (
                        <TouchableOpacity
                            key={wd.dateKey}
                            style={styles.stripItem}
                            activeOpacity={0.7}
                            onPress={() => setActiveDay(wd.dateKey)}
                        >
                            <Text style={[styles.stripDayName, { color: colors.textDim }]}>{wd.dayName}</Text>
                            <View
                                style={[
                                    styles.stripDayNum,
                                    selected && { backgroundColor: colors.primary },
                                    !selected && wd.isToday && { borderWidth: 1.5, borderColor: colors.primary },
                                ]}
                            >
                                <Text
                                    style={[
                                        styles.stripDayNumText,
                                        { color: selected ? "#fff" : wd.isToday ? colors.primary : colors.text },
                                    ]}
                                >
                                    {wd.dayNum}
                                </Text>
                            </View>
                        </TouchableOpacity>
                    );
                })}
            </View>

            {/* Hourly timeline for the active day */}
            <ScrollView ref={scrollRef} style={{ maxHeight: 460 }} showsVerticalScrollIndicator={false}>
                <View style={styles.timelineRow}>
                    <View style={styles.hourLabels}>
                        {HOURS.map((h) => {
                            const label = h === 0 ? "12 AM" : h === 12 ? "12 PM" : h > 12 ? `${h - 12} PM` : `${h} AM`;
                            return (
                                <View key={h} style={[styles.hourLabelCell, { borderTopColor: colors.border }]}>
                                    <Text style={[styles.hourLabelText, { color: colors.textDim }]}>{label}</Text>
                                </View>
                            );
                        })}
                    </View>

                    <View style={styles.dayColumn}>
                        {HOURS.map((h) => (
                            <TouchableOpacity
                                key={h}
                                style={[styles.hourSlot, { borderTopColor: colors.border }]}
                                activeOpacity={0.5}
                                onPress={() =>
                                    openSchedule({ date: activeDayInfo.date, time: `${String(h).padStart(2, "0")}:00` })
                                }
                            />
                        ))}

                        {activeDayInfo.isToday && (
                            <View style={[styles.nowLine, { top: currentTimeTop }]} pointerEvents="none">
                                <View style={styles.nowDot} />
                                <View style={styles.nowBar} />
                            </View>
                        )}

                        {dayMeetings.map((m) => {
                            const start = new Date(m.startTime);
                            const end = new Date(m.endTime);
                            const startH = start.getHours() + start.getMinutes() / 60;
                            const endH = end.getHours() + end.getMinutes() / 60;
                            const clampedStart = Math.max(0, startH);
                            const clampedEnd = Math.min(24, endH > startH ? endH : 24);
                            const duration = Math.max(0.4, clampedEnd - clampedStart);
                            const topPx = clampedStart * HOUR_HEIGHT;
                            const heightPx = Math.max(30, duration * HOUR_HEIGHT - 2);

                            return (
                                <TouchableOpacity
                                    key={m.id}
                                    activeOpacity={0.85}
                                    onPress={() => openDetails(m)}
                                    style={[styles.meetingBlock, { top: topPx, height: heightPx, backgroundColor: colors.primary }]}
                                >
                                    <View style={styles.meetingBlockTitleRow}>
                                        {m.meetingUrl && <Ionicons name="videocam" size={10} color="#fff" />}
                                        <Text style={styles.meetingTitle} numberOfLines={1}>
                                            {m.title}
                                        </Text>
                                    </View>
                                    <Text style={styles.meetingTime} numberOfLines={1}>
                                        {start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} – {end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { borderWidth: 1, borderRadius: BORDER_RADIUS.lg, overflow: "hidden" },
    strip: { flexDirection: "row", borderBottomWidth: 1, paddingVertical: 10 },
    stripItem: { flex: 1, alignItems: "center", gap: 6 },
    stripDayName: { fontSize: 10, fontFamily: FONTS.bold, textTransform: "uppercase" },
    stripDayNum: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
    stripDayNumText: { fontSize: 13, fontFamily: FONTS.bold },

    timelineRow: { flexDirection: "row" },
    hourLabels: { width: 52 },
    hourLabelCell: { height: HOUR_HEIGHT, borderTopWidth: StyleSheet.hairlineWidth, paddingRight: 6, paddingTop: 2, alignItems: "flex-end" },
    hourLabelText: { fontSize: 9 },

    dayColumn: { flex: 1, position: "relative" },
    hourSlot: { height: HOUR_HEIGHT, borderTopWidth: StyleSheet.hairlineWidth },

    nowLine: { position: "absolute", left: 0, right: 0, flexDirection: "row", alignItems: "center", zIndex: 5 },
    nowDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: "#f43f5e", marginLeft: -3 },
    nowBar: { flex: 1, height: 1.5, backgroundColor: "#f43f5e" },

    meetingBlock: { position: "absolute", left: 4, right: 4, borderRadius: BORDER_RADIUS.sm, paddingHorizontal: 8, paddingVertical: 5, justifyContent: "center", gap: 1, zIndex: 3 },
    meetingBlockTitleRow: { flexDirection: "row", alignItems: "center", gap: 4 },
    meetingTitle: { fontSize: 11, fontFamily: FONTS.bold, color: "#fff", flexShrink: 1 },
    meetingTime: { fontSize: 9, color: "#ffffffcc" },
});
