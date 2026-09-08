import React, { useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Sheet from "../../components/Sheet";
import AppButton from "../../components/AppButton";
import { SPACING, BORDER_RADIUS, FONTS } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import { calendarDayKey, addDateOnlyDays } from "../../utils/calendarDate";
import type { CalendarCtx } from "./CalendarScreen";

export default function DayItemsSheet({
    ctx,
    date,
    onClose,
}: {
    ctx: CalendarCtx;
    date: Date | null;
    onClose: () => void;
}) {
    const { colors } = useTheme();
    const { meetings, taskDeadlines, publicHolidays, leaves, activeLayers, openDetails, openTask, openSchedule } = ctx;

    const items = useMemo(() => {
        if (!date) return { meetings: [], tasks: [], holidays: [], leaves: [] };
        const key = calendarDayKey(date);

        const dayMeetings = activeLayers.meetings ? meetings.filter((m) => calendarDayKey(m.startTime) === key) : [];
        const dayTasks = activeLayers.tasks ? taskDeadlines.filter((t) => calendarDayKey(t.date) === key) : [];
        const dayHolidays = activeLayers.holidays ? publicHolidays.filter((h) => calendarDayKey(h.date) === key) : [];
        const dayLeaves = activeLayers.leaves
            ? leaves.filter((l) => {
                  const start = new Date(l.startDate);
                  const end = new Date(l.endDate);
                  for (let d = start; d <= end; d = addDateOnlyDays(d, 1)) {
                      if (calendarDayKey(d) === key) return true;
                  }
                  return false;
              })
            : [];

        return { meetings: dayMeetings, tasks: dayTasks, holidays: dayHolidays, leaves: dayLeaves };
    }, [date, meetings, taskDeadlines, publicHolidays, leaves, activeLayers]);

    const isEmpty =
        items.meetings.length === 0 && items.tasks.length === 0 && items.holidays.length === 0 && items.leaves.length === 0;

    return (
        <Sheet visible={!!date} onClose={onClose} accessibilityLabel="Day details">
            <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
                <View style={styles.header}>
                    <Text style={[styles.headerTitle, { color: colors.text }]}>
                        {date?.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                    </Text>
                    <TouchableOpacity
                        style={[styles.addBtn, { backgroundColor: colors.primary }]}
                        onPress={() => {
                            onClose();
                            openSchedule({ date: date ?? undefined });
                        }}
                    >
                        <Ionicons name="add" size={18} color="#fff" />
                    </TouchableOpacity>
                </View>

                {isEmpty && (
                    <View style={{ alignItems: "center", paddingVertical: SPACING.xl }}>
                        <Text style={{ color: colors.textDim, fontSize: 13 }}>Nothing scheduled on this day</Text>
                        <AppButton
                            label="Schedule Meeting"
                            size="sm"
                            onPress={() => {
                                onClose();
                                openSchedule({ date: date ?? undefined });
                            }}
                            style={{ marginTop: SPACING.md }}
                        />
                    </View>
                )}

                {items.holidays.map((h) => (
                    <View key={h.id} style={[styles.row, { backgroundColor: "#f43f5e14", borderColor: "#f43f5e30" }]}>
                        <Ionicons name="sparkles" size={14} color="#f43f5e" />
                        <Text style={[styles.rowText, { color: "#e11d48" }]}>{h.name}</Text>
                    </View>
                ))}

                {items.leaves.map((l, i) => (
                    <View key={`${l.id}-${i}`} style={[styles.row, { backgroundColor: "#a855f714", borderColor: "#a855f730" }]}>
                        <Ionicons name="person-remove-outline" size={14} color="#a855f7" />
                        <Text style={[styles.rowText, { color: "#9333ea" }]}>{l.member} — {l.type} leave</Text>
                    </View>
                ))}

                {items.meetings.map((m) => (
                    <TouchableOpacity
                        key={m.id}
                        activeOpacity={0.75}
                        onPress={() => {
                            onClose();
                            openDetails(m);
                        }}
                        style={[styles.row, { backgroundColor: colors.primary + "14", borderColor: colors.primary + "30" }]}
                    >
                        {m.meetingUrl ? (
                            <Ionicons name="videocam" size={14} color={colors.primary} />
                        ) : (
                            <Ionicons name="calendar-outline" size={14} color={colors.primary} />
                        )}
                        <Text style={[styles.rowTime, { color: colors.primary }]}>
                            {new Date(m.startTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                        </Text>
                        <Text style={[styles.rowText, { color: colors.primary, flex: 1 }]} numberOfLines={1}>
                            {m.title}
                        </Text>
                    </TouchableOpacity>
                ))}

                {items.tasks.map((t) => (
                    <TouchableOpacity
                        key={t.id}
                        activeOpacity={0.75}
                        onPress={() => {
                            onClose();
                            openTask(t);
                        }}
                        style={[styles.row, { backgroundColor: "#64748b14", borderColor: "#64748b30" }]}
                    >
                        <Ionicons name="checkbox-outline" size={14} color="#64748b" />
                        <Text style={[styles.rowText, { color: colors.textMuted, flex: 1 }]} numberOfLines={1}>
                            {t.title}
                        </Text>
                    </TouchableOpacity>
                ))}

                <View style={{ height: SPACING.lg }} />
            </ScrollView>
        </Sheet>
    );
}

const styles = StyleSheet.create({
    body: { paddingHorizontal: SPACING.lg },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: SPACING.md },
    headerTitle: { fontSize: 17, fontFamily: FONTS.bold },
    addBtn: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
    row: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: BORDER_RADIUS.md, paddingHorizontal: 12, paddingVertical: 11, marginBottom: 8 },
    rowText: { fontSize: 13, fontFamily: FONTS.semibold },
    rowTime: { fontSize: 11, fontFamily: FONTS.bold },
});
