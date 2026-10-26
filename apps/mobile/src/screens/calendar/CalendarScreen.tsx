import { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
    addDays,
    addMonths,
    addWeeks,
    eachDayOfInterval,
    endOfMonth,
    endOfWeek,
    format,
    isSameDay,
    isSameMonth,
    isToday,
    startOfDay,
    startOfMonth,
    startOfWeek,
    subMonths,
    subWeeks,
} from "date-fns";
import { CalendarClock, CalendarPlus, ChevronLeft, ChevronRight, FileCheck2, Palmtree, PartyPopper, Users } from "lucide-react-native";
import { meetingsApi } from "../../api/people";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { qk } from "../../lib/query";
import { realtime, EVENTS } from "../../lib/realtime";
import { fmtTime } from "../../lib/format";
import { useTheme } from "../../theme/ThemeProvider";
import { fonts, radius } from "../../theme/tokens";
import { Button, Chip, EmptyState, Sheet, Tabs, Text, tint } from "../../components/ui";
import { Screen, ScreenHeader } from "../../components/layout/Screen";
import { MeetingDetailsSheet, ScheduleMeetingSheet, meetingColor } from "../../components/calendar/MeetingSheets";
import { tone } from "../../theme/tone";

type View_ = "month" | "week" | "agenda";
type Layer = "meetings" | "tasks" | "holidays" | "leaves";
type Item =
    | { kind: "meeting"; id: string; date: Date; title: string; color: string; time?: string; raw: any }
    | { kind: "task"; id: string; date: Date; title: string; color: string; raw: any }
    | { kind: "holiday"; id: string; date: Date; title: string; color: string }
    | { kind: "leave"; id: string; date: Date; title: string; color: string };

/** /w/[workspaceId]/calendar — calendar-dashboard.tsx with month / week / agenda views and layers. */
export function CalendarScreen() {
    const { colors } = useTheme();
    const navigation = useNavigation<any>();
    const qc = useQueryClient();
    const { width } = useWindowDimensions();
    const { workspaceId } = useWorkspace();
    const [view, setView] = useState<View_>("month");
    const [selected, setSelected] = useState(new Date());
    const [layers, setLayers] = useState<Record<Layer, boolean>>({ meetings: true, tasks: true, holidays: true, leaves: true });
    const [dayOpen, setDayOpen] = useState<Date | null>(null);
    const [meeting, setMeeting] = useState<any | null>(null);
    const [schedule, setSchedule] = useState<{ initial?: any; date?: Date } | null>(null);

    const range = useMemo(() => {
        if (view === "month") return { start: startOfWeek(startOfMonth(selected)), end: endOfWeek(endOfMonth(selected)) };
        if (view === "week") return { start: startOfWeek(selected), end: endOfWeek(selected) };
        return { start: startOfDay(selected), end: addDays(selected, 45) };
    }, [view, selected]);

    const q = useQuery({
        queryKey: qk.calendar(workspaceId, { s: range.start.toISOString(), e: range.end.toISOString() }),
        queryFn: () => meetingsApi.calendar(workspaceId, { startDate: range.start.toISOString(), endDate: range.end.toISOString() }),
        enabled: !!workspaceId,
        placeholderData: (prev) => prev,
    });
    useEffect(() => realtime.subscribe(EVENTS.MEETING_UPDATE, () => qc.invalidateQueries({ queryKey: ["calendar", workspaceId] })), [qc, workspaceId]);

    const items: Item[] = useMemo(() => {
        const d = q.data;
        if (!d) return [];
        const out: Item[] = [];
        if (layers.meetings)
            d.meetings.forEach((m: any) =>
                out.push({ kind: "meeting", id: m.id, date: new Date(m.startTime), title: m.title, color: meetingColor(m), time: m.isAllDay ? "All day" : fmtTime(m.startTime), raw: m }),
            );
        if (layers.tasks) d.taskDeadlines.forEach((t: any) => out.push({ kind: "task", id: t.id, date: new Date(t.date), title: t.title.replace(/^Task Due: /, ""), color: tone("warning"), raw: t }));
        if (layers.holidays) d.publicHolidays.forEach((h: any) => out.push({ kind: "holiday", id: h.id, date: new Date(h.date), title: h.name, color: tone("danger") }));
        if (layers.leaves)
            d.leaves.forEach((l: any) =>
                eachDayOfInterval({ start: new Date(l.startDate), end: new Date(l.endDate) }).forEach((day) =>
                    out.push({ kind: "leave", id: `${l.id}-${day.toISOString()}`, date: day, title: `${l.member} · ${l.type === "SICK" ? "Sick" : "Casual"} leave`, color: tone("leave") }),
                ),
            );
        return out.sort((a, b) => +a.date - +b.date);
    }, [q.data, layers]);

    const itemsOn = (day: Date) => items.filter((i) => isSameDay(i.date, day));
    const step = (dir: 1 | -1) =>
        setSelected((s) => (view === "month" ? (dir > 0 ? addMonths(s, 1) : subMonths(s, 1)) : view === "week" ? (dir > 0 ? addWeeks(s, 1) : subWeeks(s, 1)) : addDays(s, dir)));

    const title =
        view === "week"
            ? `${format(startOfWeek(selected), "MMM d")} – ${format(endOfWeek(selected), isSameMonth(startOfWeek(selected), endOfWeek(selected)) ? "d" : "MMM d")}`
            : format(selected, "MMMM yyyy");

    const open = (item: Item) => {
        if (item.kind === "meeting") setMeeting(item.raw);
        else if (item.kind === "task") navigation.navigate("TaskDetail", { taskId: item.raw.id, title: item.title });
    };

    const counts = {
        meetings: q.data?.meetings.length ?? 0,
        tasks: q.data?.taskDeadlines.length ?? 0,
        holidays: q.data?.publicHolidays.length ?? 0,
        leaves: q.data?.leaves.length ?? 0,
    };

    // Cell height only; widths are a seventh of the grid so its border can't push Saturday onto the next row.
    const cell = (width - 32) / 7;
    const days = eachDayOfInterval(range);

    return (
        <Screen>
            <ScreenHeader title="Calendar" />
            <ScrollView
                contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 110 }}
                refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={colors.primaryInk} />}
            >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Button size="iconSm" variant="outline" icon={ChevronLeft} onPress={() => step(-1)} />
                    <Text variant="h3" center style={{ flex: 1 }}>
                        {title}
                    </Text>
                    <Button size="iconSm" variant="outline" icon={ChevronRight} onPress={() => step(1)} />
                    <Button size="sm" variant="outline" title="Today" onPress={() => setSelected(new Date())} />
                </View>
                <Tabs scrollable={false} value={view} onChange={setView} items={[{ key: "month", label: "Month" }, { key: "week", label: "Week" }, { key: "agenda", label: "Agenda" }]} />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    <Chip label={`Meetings ${counts.meetings}`} icon={Users} color={tone("info")} active={layers.meetings} onPress={() => setLayers((l) => ({ ...l, meetings: !l.meetings }))} />
                    <Chip label={`Task due ${counts.tasks}`} icon={FileCheck2} color={tone("warning")} active={layers.tasks} onPress={() => setLayers((l) => ({ ...l, tasks: !l.tasks }))} />
                    <Chip label={`Holidays ${counts.holidays}`} icon={PartyPopper} color={tone("danger")} active={layers.holidays} onPress={() => setLayers((l) => ({ ...l, holidays: !l.holidays }))} />
                    <Chip label={`Leaves ${counts.leaves}`} icon={Palmtree} color={tone("leave")} active={layers.leaves} onPress={() => setLayers((l) => ({ ...l, leaves: !l.leaves }))} />
                </ScrollView>

                {view === "month" ? (
                    <View style={[styles.grid, { borderColor: colors.border, backgroundColor: colors.card }]}>
                        <View style={{ flexDirection: "row" }}>
                            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                                <Text key={i} variant="overline" tone="muted" center style={{ width: "14.2857%", paddingVertical: 8 }}>
                                    {d}
                                </Text>
                            ))}
                        </View>
                        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                            {days.map((day) => {
                                const dayItems = itemsOn(day);
                                const inMonth = isSameMonth(day, selected);
                                const today = isToday(day);
                                return (
                                    <Pressable
                                        key={day.toISOString()}
                                        onPress={() => setDayOpen(day)}
                                        onLongPress={() => setSchedule({ date: day })}
                                        style={({ pressed }) => [
                                            styles.cell,
                                            { width: "14.2857%", height: cell * 1.18, borderColor: colors.border, backgroundColor: pressed ? colors.secondary : "transparent", opacity: inMonth ? 1 : 0.4 },
                                        ]}
                                    >
                                        <View style={[styles.dayNum, today ? { backgroundColor: colors.primary } : null]}>
                                            <Text style={{ fontFamily: today ? fonts.bold : fonts.medium, fontSize: 12, color: today ? colors.primaryForeground : colors.foreground }}>{format(day, "d")}</Text>
                                        </View>
                                        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 2, justifyContent: "center", paddingHorizontal: 2 }}>
                                            {dayItems.slice(0, 4).map((i) => (
                                                <View key={i.id} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: i.color }} />
                                            ))}
                                        </View>
                                        {dayItems.length > 4 ? (
                                            <Text style={{ fontSize: 9, fontFamily: fonts.semibold, color: colors.mutedForeground }}>+{dayItems.length - 4}</Text>
                                        ) : null}
                                    </Pressable>
                                );
                            })}
                        </View>
                    </View>
                ) : null}

                {view === "week"
                    ? days.map((day) => {
                          const dayItems = itemsOn(day);
                          return (
                              <View key={day.toISOString()} style={{ flexDirection: "row", gap: 12 }}>
                                  <View style={[styles.weekDay, isToday(day) ? { backgroundColor: colors.primary } : { backgroundColor: colors.secondary }]}>
                                      <Text style={{ fontFamily: fonts.semibold, fontSize: 11, color: isToday(day) ? colors.primaryForeground : colors.mutedForeground }}>{format(day, "EEE")}</Text>
                                      <Text style={{ fontFamily: fonts.heading, fontSize: 18, color: isToday(day) ? colors.primaryForeground : colors.foreground }}>{format(day, "d")}</Text>
                                  </View>
                                  <View style={{ flex: 1, gap: 6, paddingVertical: 2 }}>
                                      {dayItems.length === 0 ? (
                                          <Pressable onPress={() => setSchedule({ date: day })} style={[styles.emptySlot, { borderColor: colors.border }]}>
                                              <Text variant="caption" tone="muted">
                                                  Nothing scheduled
                                              </Text>
                                          </Pressable>
                                      ) : (
                                          dayItems.map((i) => <ItemRow key={i.id} item={i} onPress={() => open(i)} />)
                                      )}
                                  </View>
                              </View>
                          );
                      })
                    : null}

                {view === "agenda" ? (
                    items.length === 0 ? (
                        <EmptyState icon={CalendarClock} title="Nothing coming up" description="Meetings, deadlines, holidays and leaves for the next weeks appear here." />
                    ) : (
                        groupByDay(items).map(([key, dayItems]) => (
                            <View key={key} style={{ gap: 6 }}>
                                <Text variant="overline" tone={isToday(dayItems[0].date) ? "primary" : "muted"}>
                                    {isToday(dayItems[0].date) ? "Today · " : ""}
                                    {format(dayItems[0].date, "EEEE, dd MMM")}
                                </Text>
                                {dayItems.map((i) => (
                                    <ItemRow key={i.id} item={i} onPress={() => open(i)} />
                                ))}
                            </View>
                        ))
                    )
                ) : null}
            </ScrollView>

            <Pressable onPress={() => setSchedule({ date: selected })} style={({ pressed }) => [styles.fab, { backgroundColor: colors.primary, transform: [{ scale: pressed ? 0.94 : 1 }] }]}>
                <CalendarPlus size={24} color={colors.primaryForeground} />
            </Pressable>

            <Sheet open={!!dayOpen} onClose={() => setDayOpen(null)} title={dayOpen ? format(dayOpen, "EEEE, dd MMMM") : ""}>
                {dayOpen && itemsOn(dayOpen).length === 0 ? (
                    <Text tone="muted" center style={{ paddingVertical: 12 }}>
                        Nothing on this day.
                    </Text>
                ) : null}
                {dayOpen
                    ? itemsOn(dayOpen).map((i) => (
                          <ItemRow
                              key={i.id}
                              item={i}
                              onPress={() => {
                                  setDayOpen(null);
                                  setTimeout(() => open(i), 250);
                              }}
                          />
                      ))
                    : null}
                <Button icon={CalendarPlus} title="Schedule a meeting" variant="outline" onPress={() => { const d = dayOpen; setDayOpen(null); setTimeout(() => setSchedule({ date: d ?? undefined }), 250); }} />
            </Sheet>

            {meeting ? <MeetingDetailsSheet meeting={meeting} onClose={() => setMeeting(null)} onEdit={(m) => { setMeeting(null); setTimeout(() => setSchedule({ initial: m }), 250); }} /> : null}
            {schedule ? <ScheduleMeetingSheet initial={schedule.initial} defaultDate={schedule.date} onClose={() => setSchedule(null)} /> : null}
        </Screen>
    );
}

function groupByDay(items: Item[]) {
    const map = new Map<string, Item[]>();
    items.forEach((i) => {
        const key = format(i.date, "yyyy-MM-dd");
        map.set(key, [...(map.get(key) ?? []), i]);
    });
    return [...map.entries()];
}

function ItemRow({ item, onPress }: { item: Item; onPress: () => void }) {
    const { colors } = useTheme();
    const label = { meeting: "Meeting", task: "Task due", holiday: "Holiday", leave: "Leave" }[item.kind];
    return (
        <Pressable
            onPress={onPress}
            disabled={item.kind === "holiday" || item.kind === "leave"}
            style={({ pressed }) => [styles.item, { backgroundColor: pressed ? colors.secondary : tint(item.color, 0.08), borderLeftColor: item.color }]}
        >
            <View style={{ flex: 1, gap: 2 }}>
                <Text variant="bodyMedium" numberOfLines={1}>
                    {item.title}
                </Text>
                <Text variant="caption" tone="muted">
                    {label}
                    {item.kind === "meeting" && item.time ? ` · ${item.time}` : ""}
                    {item.kind === "meeting" && item.raw.location ? ` · ${item.raw.location}` : ""}
                </Text>
            </View>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    grid: { borderRadius: radius.lg, borderWidth: 1, overflow: "hidden" },
    cell: { alignItems: "center", paddingTop: 4, gap: 3, borderTopWidth: 1 },
    dayNum: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
    weekDay: { width: 52, borderRadius: radius.md, alignItems: "center", justifyContent: "center", paddingVertical: 8, alignSelf: "flex-start" },
    emptySlot: { borderWidth: 1, borderStyle: "dashed", borderRadius: radius.sm, paddingVertical: 12, alignItems: "center" },
    item: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.sm, borderLeftWidth: 3 },
    fab: { position: "absolute", right: 20, bottom: 32, width: 58, height: 58, borderRadius: 20, alignItems: "center", justifyContent: "center" },
});
