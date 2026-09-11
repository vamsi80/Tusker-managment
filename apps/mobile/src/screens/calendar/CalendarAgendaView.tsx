import React, { useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SPACING, BORDER_RADIUS, FONTS } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import { Meeting } from "../../types";
import { calendarDayKey } from "../../utils/calendarDate";
import AppButton from "../../components/AppButton";
import type { CalendarCtx } from "./CalendarScreen";

interface Group {
    label: string;
    dateKey: string;
    items: Meeting[];
}

export default function CalendarAgendaView({ ctx }: { ctx: CalendarCtx }) {
    const { colors } = useTheme();
    const { meetings, filterType, searchQuery, openDetails, openSchedule } = ctx;

    const groups = useMemo<Group[]>(() => {
        const now = new Date();
        const todayKey = calendarDayKey(now);
        const tomorrow = new Date(now);
        tomorrow.setDate(now.getDate() + 1);
        const tomorrowKey = calendarDayKey(tomorrow);

        const filtered = meetings.filter((m) => {
            if (m.status === "CANCELLED") return false;
            if (filterType !== "ALL" && m.type !== filterType) return false;
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                return (
                    m.title.toLowerCase().includes(q) ||
                    m.description?.toLowerCase().includes(q) ||
                    m.location?.toLowerCase().includes(q)
                );
            }
            return true;
        });

        filtered.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

        const map = new Map<string, Meeting[]>();
        filtered.forEach((m) => {
            const key = calendarDayKey(m.startTime);
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(m);
        });

        const out: Group[] = [];
        map.forEach((items, dateKey) => {
            let label: string;
            if (dateKey === todayKey) label = "Today";
            else if (dateKey === tomorrowKey) label = "Tomorrow";
            else {
                const d = new Date(`${dateKey}T00:00:00`);
                label = d.toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                    year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
                });
            }
            out.push({ label, dateKey, items });
        });
        return out;
    }, [meetings, filterType, searchQuery]);

    if (groups.length === 0) {
        return (
            <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={[styles.emptyIcon, { backgroundColor: colors.surfaceHighlight }]}>
                    <Ionicons name="calendar-outline" size={26} color={colors.textDim} />
                </View>
                <Text style={[styles.emptyTitle, { color: colors.text }]}>No upcoming meetings</Text>
                <Text style={[styles.emptyBody, { color: colors.textDim }]}>
                    Schedule sprint syncs, project reviews, or client calls.
                </Text>
                <AppButton
                    label="Schedule Meeting"
                    icon="add"
                    onPress={() => openSchedule()}
                    style={{ marginTop: SPACING.md }}
                />
            </View>
        );
    }

    return (
        <View style={{ gap: SPACING.lg }}>
            {groups.map((group) => (
                <View key={group.dateKey} style={{ gap: SPACING.sm }}>
                    <View style={styles.groupHeader}>
                        <Text style={[styles.groupLabel, { color: colors.text }]}>{group.label}</Text>
                        <Text style={[styles.groupDate, { color: colors.textDim }]}>
                            {new Date(`${group.dateKey}T00:00:00`).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                            })}
                        </Text>
                        <View style={[styles.groupRule, { backgroundColor: colors.border }]} />
                    </View>

                    {group.items.map((m) => {
                        const start = new Date(m.startTime);
                        const end = new Date(m.endTime);
                        const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60000);

                        return (
                            <TouchableOpacity
                                key={m.id}
                                activeOpacity={0.8}
                                onPress={() => openDetails(m)}
                                style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
                            >
                                <View style={styles.cardTop}>
                                    <View style={[styles.timeBlock, { backgroundColor: colors.surfaceHighlight, borderColor: colors.border }]}>
                                        <Text style={[styles.timeText, { color: colors.text }]}>
                                            {start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                        </Text>
                                        <Text style={[styles.durationText, { color: colors.textDim }]}>
                                            {durationMinutes >= 60 ? `${durationMinutes / 60}h` : `${durationMinutes}m`}
                                        </Text>
                                    </View>

                                    <View style={{ flex: 1, minWidth: 0 }}>
                                        <View style={styles.badgeRow}>
                                            <View style={[styles.badge, { borderColor: colors.border }]}>
                                                <Text style={[styles.badgeText, { color: colors.textMuted }]}>
                                                    {m.type.replace(/_/g, " ")}
                                                </Text>
                                            </View>
                                            {m.project && (
                                                <View style={[styles.badge, { borderColor: colors.primary + "40" }]}>
                                                    <Ionicons name="briefcase-outline" size={10} color={colors.primary} />
                                                    <Text style={[styles.badgeText, { color: colors.primary }]} numberOfLines={1}>
                                                        {m.project.name}
                                                    </Text>
                                                </View>
                                            )}
                                        </View>
                                        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
                                            {m.title}
                                        </Text>
                                        {m.location && (
                                            <View style={styles.metaRow}>
                                                <Ionicons name="location-outline" size={12} color={colors.textDim} />
                                                <Text style={[styles.metaText, { color: colors.textDim }]} numberOfLines={1}>
                                                    {m.location}
                                                </Text>
                                            </View>
                                        )}
                                    </View>
                                </View>

                                <View style={[styles.cardBottom, { borderTopColor: colors.border }]}>
                                    <View style={styles.avatarStack}>
                                        {m.attendees.slice(0, 4).map((a, i) => (
                                            <View
                                                key={a.id}
                                                style={[
                                                    styles.avatar,
                                                    { backgroundColor: colors.surfaceHighlight, borderColor: colors.surface, marginLeft: i === 0 ? 0 : -8 },
                                                ]}
                                            >
                                                {a.user?.image ? (
                                                    <Image source={{ uri: a.user.image }} style={styles.avatarImg} />
                                                ) : (
                                                    <Text style={[styles.avatarTxt, { color: colors.textDim }]}>
                                                        {(a.user?.surname || a.user?.name || "M")[0]?.toUpperCase()}
                                                    </Text>
                                                )}
                                            </View>
                                        ))}
                                        {m.attendees.length > 4 && (
                                            <Text style={[styles.moreText, { color: colors.textDim }]}>
                                                +{m.attendees.length - 4}
                                            </Text>
                                        )}
                                    </View>

                                    {m.meetingUrl && (
                                        <TouchableOpacity
                                            style={[styles.joinBtn, { backgroundColor: colors.primary }]}
                                            onPress={(e) => {
                                                e.stopPropagation();
                                                Linking.openURL(m.meetingUrl!);
                                            }}
                                        >
                                            <Ionicons name="videocam" size={13} color="#fff" />
                                            <Text style={styles.joinText}>Join</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    empty: { padding: SPACING.xl, borderRadius: BORDER_RADIUS.lg, borderWidth: 1, alignItems: "center" },
    emptyIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", marginBottom: SPACING.sm },
    emptyTitle: { fontSize: 15, fontFamily: FONTS.bold, marginBottom: 4 },
    emptyBody: { fontSize: 12, textAlign: "center", lineHeight: 17 },

    groupHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
    groupLabel: { fontSize: 14, fontFamily: FONTS.bold },
    groupDate: { fontSize: 12 },
    groupRule: { flex: 1, height: 1, marginLeft: 4 },

    card: { borderWidth: 1, borderRadius: BORDER_RADIUS.lg, padding: SPACING.md, gap: SPACING.sm },
    cardTop: { flexDirection: "row", gap: SPACING.sm },
    timeBlock: { borderWidth: 1, borderRadius: BORDER_RADIUS.sm, alignItems: "center", justifyContent: "center", paddingVertical: 8, paddingHorizontal: 10, minWidth: 72 },
    timeText: { fontSize: 12, fontFamily: FONTS.bold },
    durationText: { fontSize: 10, marginTop: 1 },

    badgeRow: { flexDirection: "row", gap: 6, marginBottom: 4, flexWrap: "wrap" },
    badge: { flexDirection: "row", alignItems: "center", gap: 3, borderWidth: 1, borderRadius: BORDER_RADIUS.full, paddingHorizontal: 7, paddingVertical: 2 },
    badgeText: { fontSize: 9, fontFamily: FONTS.bold, textTransform: "capitalize" },
    title: { fontSize: 15, fontFamily: FONTS.bold },
    metaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 },
    metaText: { fontSize: 11, flexShrink: 1 },

    cardBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, paddingTop: SPACING.sm },
    avatarStack: { flexDirection: "row", alignItems: "center" },
    avatar: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, alignItems: "center", justifyContent: "center", overflow: "hidden" },
    avatarImg: { width: "100%", height: "100%" },
    avatarTxt: { fontSize: 9, fontFamily: FONTS.bold },
    moreText: { fontSize: 10, marginLeft: 6, fontFamily: FONTS.semibold },

    joinBtn: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: BORDER_RADIUS.md, paddingHorizontal: 12, paddingVertical: 7 },
    joinText: { fontSize: 12, fontFamily: FONTS.bold, color: "#fff" },
});
