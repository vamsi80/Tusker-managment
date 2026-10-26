import { useEffect, useState } from "react";
import { View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Cake, MapPin, Video } from "lucide-react-native";
import { meetingsApi } from "../../../api/people";
import { workspacesApi } from "../../../api/workspaces";
import { useWorkspace } from "../../../providers/WorkspaceProvider";
import { qk } from "../../../lib/query";
import { realtime, EVENTS } from "../../../lib/realtime";
import { fmtDate, fmtTime } from "../../../lib/format";
import { useTheme } from "../../../theme/ThemeProvider";
import { Badge, Button, EmptyState, Skeleton, Text } from "../../../components/ui";
import { PillSwitch, WidgetCard, WidgetRow } from "./WidgetCard";

/** MeetingsWidget: ±30 days, Upcoming / Previous. */
export function MeetingsWidget() {
    const { colors } = useTheme();
    const navigation = useNavigation<any>();
    const qc = useQueryClient();
    const { workspaceId } = useWorkspace();
    const [tab, setTab] = useState<"upcoming" | "previous">("upcoming");
    const range = (() => {
        const start = new Date();
        start.setDate(start.getDate() - 30);
        const end = new Date();
        end.setDate(end.getDate() + 30);
        return { startDate: start.toISOString(), endDate: end.toISOString() };
    })();

    const query = useQuery({
        queryKey: qk.calendar(workspaceId, "widget"),
        queryFn: () => meetingsApi.calendar(workspaceId, range),
        enabled: !!workspaceId,
    });
    useEffect(() => realtime.subscribe(EVENTS.MEETING_UPDATE, () => qc.invalidateQueries({ queryKey: ["calendar", workspaceId] })), [qc, workspaceId]);

    const now = Date.now();
    const meetings = (query.data?.meetings ?? [])
        .filter((m: any) => m.status !== "CANCELLED")
        .filter((m: any) => (tab === "upcoming" ? new Date(m.startTime).getTime() >= now : new Date(m.startTime).getTime() < now))
        .sort((a: any, b: any) => {
            const diff = new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
            return tab === "upcoming" ? diff : -diff;
        });

    return (
        <WidgetCard title="Meetings" icon={CalendarDays} meta={tab === "upcoming" ? "Next 30 days" : "Past 30 days"}>
            <PillSwitch value={tab} onChange={setTab} items={[{ key: "upcoming", label: "Upcoming" }, { key: "previous", label: "Previous" }]} />
            {query.isLoading ? (
                <Skeleton height={56} />
            ) : meetings.length === 0 ? (
                <View style={{ alignItems: "center", gap: 10, paddingVertical: 12 }}>
                    <Text variant="small" tone="muted" style={{ fontStyle: "italic" }}>
                        {tab === "upcoming" ? "No upcoming meetings" : "No meetings in the past 30 days"}
                    </Text>
                    {tab === "upcoming" ? <Button size="sm" variant="outline" title="Schedule a meeting" onPress={() => navigation.navigate("Calendar")} /> : null}
                </View>
            ) : (
                <View style={{ gap: 4 }}>
                    {meetings.slice(0, 8).map((m: any) => (
                        <WidgetRow key={m.id} onPress={() => navigation.navigate("Calendar")}>
                            <View style={{ flex: 1, gap: 5 }}>
                                <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
                                    <Text variant="bodyMedium" numberOfLines={1} style={{ flex: 1 }}>
                                        {m.title}
                                    </Text>
                                    <Text variant="caption" tone="muted">
                                        {fmtTime(m.startTime)}
                                    </Text>
                                </View>
                                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                                    <Badge size="xs" variant="outline" label={fmtDate(m.startTime, "EEE, MMM d")} />
                                    {m.meetingUrl ? (
                                        <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                                            <Video size={11} color={colors.mutedForeground} />
                                            <Text variant="caption" tone="muted">
                                                Online
                                            </Text>
                                        </View>
                                    ) : null}
                                    {m.location ? (
                                        <View style={{ flexDirection: "row", alignItems: "center", gap: 3, flexShrink: 1 }}>
                                            <MapPin size={11} color={colors.mutedForeground} />
                                            <Text variant="caption" tone="muted" numberOfLines={1}>
                                                {m.location}
                                            </Text>
                                        </View>
                                    ) : null}
                                </View>
                            </View>
                        </WidgetRow>
                    ))}
                </View>
            )}
        </WidgetCard>
    );
}

/** BirthdaysWidget: this month's birthdays, today's highlighted. */
export function BirthdaysWidget() {
    const { workspaceId } = useWorkspace();
    const query = useQuery({ queryKey: qk.birthdays(workspaceId), queryFn: () => workspacesApi.birthdays(workspaceId), enabled: !!workspaceId });
    const month = fmtDate(new Date(), "MMM");
    const members = query.data ?? [];

    return (
        <WidgetCard title="Birthdays" icon={Cake} meta={fmtDate(new Date(), "MMMM")}>
            {query.isLoading ? (
                <Text variant="small" tone="muted" center style={{ fontStyle: "italic", paddingVertical: 12 }}>
                    Loading…
                </Text>
            ) : members.length === 0 ? (
                <EmptyState icon={Cake} title="No birthdays left this month" compact />
            ) : (
                <View style={{ gap: 8 }}>
                    {members.map((member: any) => (
                        <WidgetRow key={member.id}>
                            <Text numberOfLines={1} style={{ flex: 1 }}>
                                <Text weight="semibold">{member.surname}</Text>
                                {member.designation ? <Text tone="muted"> - {member.designation}</Text> : null}
                            </Text>
                            <Badge label={member.isToday ? "Today 🎉" : `${month} ${member.day}`} variant={member.isToday ? "solid" : "outline"} color={member.isToday ? "#f59e0b" : undefined} />
                        </WidgetRow>
                    ))}
                </View>
            )}
        </WidgetCard>
    );
}
