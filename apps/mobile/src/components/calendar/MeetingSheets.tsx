import { useEffect, useState } from "react";
import { Linking, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addMinutes, format } from "date-fns";
import { AlertTriangle, CalendarClock, Clock, FolderKanban, MapPin, Pencil, Trash2, Users, Video } from "lucide-react-native";
import { meetingsApi } from "../../api/people";
import { workspacesApi } from "../../api/workspaces";
import { useAuth } from "../../providers/AuthProvider";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { qk } from "../../lib/query";
import { MEETING_COLORS, RSVP_LABELS } from "../../lib/constants";
import { displayName, fmtDate, fmtTime } from "../../lib/format";
import { toast } from "../../lib/toast";
import { useTheme } from "../../theme/ThemeProvider";
import { Avatar, Badge, Banner, Button, DateField, Input, MultiSelect, Select, Sheet, SwitchRow, Tabs, Text, confirm } from "../ui";
import { tone } from "../../theme/tone";

export const MEETING_TYPE_OPTIONS = [
    { value: "INTERNAL", label: "Internal Team Sync", color: "indigo" },
    { value: "CLIENT", label: "Client Meeting", color: "emerald" },
    { value: "PROJECT_REVIEW", label: "Project Review", color: "amber" },
    { value: "ONE_ON_ONE", label: "1-on-1 Meeting", color: "rose" },
    { value: "GENERAL", label: "All Hands / General", color: "sky" },
];
export const meetingColor = (m: { color?: string | null; type?: string }) =>
    MEETING_COLORS[m.color ?? ""] ?? MEETING_COLORS[MEETING_TYPE_OPTIONS.find((t) => t.value === m.type)?.color ?? "indigo"] ?? "#0ea5e9";

/** meeting-details-dialog.tsx */
export function MeetingDetailsSheet({ meeting, onClose, onEdit }: { meeting: any; onClose: () => void; onEdit: (m: any) => void }) {
    const { colors } = useTheme();
    const qc = useQueryClient();
    const auth = useAuth();
    const myId = auth.status === "signedIn" ? auth.user.id : "";
    const { workspaceId, isAdmin } = useWorkspace();
    const isOrganizer = meeting.organizerId === myId;
    const mine = meeting.attendees?.find((a: any) => a.userId === myId);
    const refresh = () => qc.invalidateQueries({ queryKey: ["calendar", workspaceId] });

    const rsvp = useMutation({
        mutationFn: (status: "ACCEPTED" | "DECLINED" | "TENTATIVE") => meetingsApi.rsvp(meeting.id, status),
        onSuccess: (_, s) => {
            toast.success(`RSVP updated: ${s.toLowerCase()}`);
            refresh();
        },
        onError: (e) => toast.fromError(e, "Failed to update RSVP"),
    });
    const status = useMutation({
        mutationFn: (s: string) => meetingsApi.update(meeting.id, workspaceId, { status: s }),
        onSuccess: (_, s) => {
            toast.success(`Meeting status changed to ${s.toLowerCase().replace("_", " ")}`);
            refresh();
            onClose();
        },
        onError: (e) => toast.fromError(e),
    });
    const remove = useMutation({
        mutationFn: () => meetingsApi.remove(meeting.id, workspaceId),
        onSuccess: () => {
            toast.success("Meeting deleted");
            refresh();
            onClose();
        },
        onError: (e) => toast.fromError(e),
    });

    const color = meetingColor(meeting);
    return (
        <Sheet open onClose={onClose} title={meeting.title} description={MEETING_TYPE_OPTIONS.find((t) => t.value === meeting.type)?.label}>
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
                <Badge label={meeting.status.replace(/_/g, " ").toLowerCase()} color={meeting.status === "CANCELLED" ? colors.destructive : meeting.status === "COMPLETED" ? colors.success : color} />
            </View>
            <Line icon={CalendarClock} text={fmtDate(meeting.startTime, "EEEE, dd MMMM yyyy")} />
            <Line icon={Clock} text={meeting.isAllDay ? "All day" : `${fmtTime(meeting.startTime)} – ${fmtTime(meeting.endTime)}`} />
            {meeting.location ? <Line icon={MapPin} text={meeting.location} /> : null}
            {meeting.project ? <Line icon={FolderKanban} text={meeting.project.name} /> : null}
            {meeting.overlapsWith?.length ? <Banner tone="warning" title="Overlaps">{meeting.overlapsWith.map((o: any) => o.title).join(", ")}</Banner> : null}
            {meeting.description ? <Text variant="body" tone="muted">{meeting.description}</Text> : null}
            {meeting.meetingUrl ? (
                <Button icon={Video} title="Join Video Call" onPress={() => Linking.openURL(/^https?:/.test(meeting.meetingUrl) ? meeting.meetingUrl : `https://${meeting.meetingUrl}`)} />
            ) : null}
            {mine && !isOrganizer ? (
                <View style={{ gap: 6 }}>
                    <Text variant="overline" tone="muted">
                        Your response
                    </Text>
                    <Tabs
                        scrollable={false}
                        value={mine.status === "INVITED" ? ("" as any) : mine.status}
                        onChange={(s) => rsvp.mutate(s)}
                        items={(["ACCEPTED", "TENTATIVE", "DECLINED"] as const).map((s) => ({ key: s, label: RSVP_LABELS[s] }))}
                    />
                </View>
            ) : null}
            <View style={{ gap: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Users size={14} color={colors.mutedForeground} />
                    <Text variant="overline" tone="muted">
                        {meeting.attendees?.length ?? 0} attendees
                    </Text>
                </View>
                {(meeting.attendees ?? []).map((a: any) => (
                    <View key={a.id} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                        <Avatar name={displayName(a.user)} image={a.user?.image} size={28} />
                        <Text variant="bodyMedium" style={{ flex: 1 }}>
                            {displayName(a.user)}
                            {a.userId === meeting.organizerId ? <Text tone="muted"> · organizer</Text> : null}
                        </Text>
                        <Badge label={RSVP_LABELS[a.status] ?? a.status} size="xs" variant="muted" />
                    </View>
                ))}
            </View>
            {isOrganizer || isAdmin ? (
                <>
                    <Select
                        label="Status"
                        value={meeting.status}
                        onChange={(s) => s && s !== meeting.status && status.mutate(s)}
                        options={[
                            { value: "SCHEDULED", label: "Scheduled" },
                            { value: "IN_PROGRESS", label: "In progress" },
                            { value: "COMPLETED", label: "Completed" },
                            { value: "CANCELLED", label: "Cancelled" },
                        ]}
                    />
                    <View style={{ flexDirection: "row", gap: 8 }}>
                        <Button variant="outline" icon={Pencil} title="Edit" style={{ flex: 1 }} onPress={() => onEdit(meeting)} />
                        <Button
                            variant="destructiveOutline"
                            icon={Trash2}
                            title="Delete"
                            style={{ flex: 1 }}
                            loading={remove.isPending}
                            onPress={async () => {
                                if (await confirm({ title: "Delete this meeting?", message: "Attendees are notified.", confirmLabel: "Delete", destructive: true })) remove.mutate();
                            }}
                        />
                    </View>
                </>
            ) : null}
        </Sheet>
    );
}

function Line({ icon: Icon, text }: { icon: any; text: string }) {
    const { colors } = useTheme();
    return (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Icon size={16} color={colors.mutedForeground} />
            <Text variant="bodyMedium" style={{ flex: 1 }}>
                {text}
            </Text>
        </View>
    );
}

/** schedule-meeting-dialog.tsx — create or edit, with a conflict check before saving. */
export function ScheduleMeetingSheet({ initial, defaultDate, onClose }: { initial?: any | null; defaultDate?: Date; onClose: () => void }) {
    const qc = useQueryClient();
    const auth = useAuth();
    const myId = auth.status === "signedIn" ? auth.user.id : "";
    const { workspaceId, layout } = useWorkspace();
    const base = defaultDate ?? new Date();
    const roundedStart = (() => {
        const d = new Date(base);
        d.setMinutes(Math.ceil(d.getMinutes() / 30) * 30, 0, 0);
        if (d.getHours() < 8) d.setHours(10, 0);
        return d;
    })();

    const [title, setTitle] = useState(initial?.title ?? "");
    const [type, setType] = useState<string>(initial?.type ?? "INTERNAL");
    const [start, setStart] = useState<Date>(initial ? new Date(initial.startTime) : roundedStart);
    const [end, setEnd] = useState<Date>(initial ? new Date(initial.endTime) : addMinutes(roundedStart, 30));
    const [isAllDay, setIsAllDay] = useState(!!initial?.isAllDay);
    const [meetingUrl, setMeetingUrl] = useState(initial?.meetingUrl ?? "");
    const [location, setLocation] = useState(initial?.location ?? "");
    const [projectId, setProjectId] = useState<string | null>(initial?.projectId ?? null);
    const [reminder, setReminder] = useState(String(initial?.reminderMinutes ?? 15));
    const [attendees, setAttendees] = useState<string[]>(initial?.attendees?.map((a: any) => a.userId).filter((id: string) => id !== myId) ?? []);
    const [description, setDescription] = useState(initial?.description ?? "");
    const [conflicts, setConflicts] = useState<any[]>([]);
    const members = useQuery({ queryKey: qk.membersSlim(workspaceId), queryFn: () => workspacesApi.membersSlim(workspaceId) });

    useEffect(() => {
        if (isAllDay || end <= start) return setConflicts([]);
        const t = setTimeout(() => {
            meetingsApi
                .conflicts({ workspaceId, startTime: start.toISOString(), endTime: end.toISOString(), location: location || null, attendeeUserIds: attendees, excludeMeetingId: initial?.id })
                .then((c) => setConflicts(Array.isArray(c) ? c : []))
                .catch(() => setConflicts([]));
        }, 500);
        return () => clearTimeout(t);
    }, [start, end, location, attendees, isAllDay, workspaceId, initial?.id]);

    const setDuration = (mins: number) => setEnd(addMinutes(start, mins));
    const save = useMutation({
        mutationFn: () => {
            if (!title.trim()) throw new Error("Title is required");
            if (!isAllDay && end <= start) throw new Error("End time must be after the start time");
            const s = new Date(start);
            const e = new Date(end);
            if (isAllDay) {
                s.setHours(0, 0, 0, 0);
                e.setTime(s.getTime());
                e.setHours(23, 59, 0, 0);
            }
            const body = {
                workspaceId,
                title: title.trim(),
                description: description.trim() || null,
                startTime: s.toISOString(),
                endTime: e.toISOString(),
                location: location.trim() || null,
                meetingUrl: meetingUrl.trim() || null,
                type,
                color: MEETING_TYPE_OPTIONS.find((t) => t.value === type)?.color ?? "indigo",
                reminderMinutes: Number(reminder),
                isAllDay,
                projectId,
                attendeeUserIds: attendees,
            };
            return initial ? meetingsApi.update(initial.id, workspaceId, body) : meetingsApi.create(body);
        },
        onSuccess: () => {
            toast.success(initial ? "Meeting updated" : "Meeting scheduled");
            qc.invalidateQueries({ queryKey: ["calendar", workspaceId] });
            onClose();
        },
        onError: (e) => toast.fromError(e, "Failed to save meeting"),
    });

    const changeDay = (d: Date | null) => {
        if (!d) return;
        const s = new Date(start);
        s.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
        const dur = end.getTime() - start.getTime();
        setStart(s);
        setEnd(new Date(s.getTime() + dur));
    };
    const changeStart = (d: Date | null) => {
        if (!d) return;
        const s = new Date(start);
        s.setHours(d.getHours(), d.getMinutes(), 0, 0);
        const dur = end.getTime() - start.getTime();
        setStart(s);
        setEnd(new Date(s.getTime() + Math.max(dur, 15 * 60_000)));
    };
    const changeEnd = (d: Date | null) => {
        if (!d) return;
        const e = new Date(start);
        e.setHours(d.getHours(), d.getMinutes(), 0, 0);
        setEnd(e);
    };

    return (
        <Sheet
            open
            onClose={onClose}
            title={initial ? "Edit meeting" : "Schedule a meeting"}
            description="Set up agenda, invite members, and configure reminders."
            footer={
                <>
                    <Button title="Cancel" variant="outline" style={{ flex: 1 }} onPress={onClose} />
                    <Button title={initial ? "Save" : "Schedule"} style={{ flex: 1 }} loading={save.isPending} onPress={() => save.mutate()} />
                </>
            }
        >
            <Input label="Title" required placeholder="e.g., Weekly Sprint Planning & Review" value={title} onChangeText={setTitle} maxLength={200} />
            <Select label="Meeting Type" value={type} onChange={(v) => v && setType(v)} options={MEETING_TYPE_OPTIONS.map((t) => ({ value: t.value, label: t.label }))} />
            <DateField label="Date" value={start} onChange={changeDay} />
            <SwitchRow label="All day" value={isAllDay} onChange={setIsAllDay} />
            {!isAllDay ? (
                <>
                    <View style={{ flexDirection: "row", gap: 10 }}>
                        <View style={{ flex: 1 }}>
                            <DateField label="Starts" mode="time" value={start} onChange={changeStart} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <DateField label="Ends" mode="time" value={end} onChange={changeEnd} />
                        </View>
                    </View>
                    <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                        {[15, 30, 45, 60, 90].map((m) => (
                            <Button key={m} size="sm" variant="outline" title={m < 60 ? `${m}m` : `${m / 60}h`} onPress={() => setDuration(m)} />
                        ))}
                    </View>
                </>
            ) : null}
            {conflicts.length ? (
                <Banner tone="warning" title="Scheduling conflicts">
                    <View style={{ gap: 2 }}>
                        {conflicts.slice(0, 4).map((c: any, i: number) => (
                            <View key={i} style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                                <AlertTriangle size={12} color={tone("warning")} />
                                <Text variant="small" color={tone("warning")} numberOfLines={1} style={{ flex: 1 }}>
                                    {c.title ?? c.meeting?.title} · {fmtTime(c.startTime ?? c.meeting?.startTime)}
                                    {c.reason ? ` (${c.reason})` : ""}
                                </Text>
                            </View>
                        ))}
                    </View>
                </Banner>
            ) : null}
            <Input label="Meeting link" placeholder="e.g. meet.google.com/abc-xyz" autoCapitalize="none" keyboardType="url" value={meetingUrl} onChangeText={setMeetingUrl} />
            <Input label="Location" placeholder="e.g. Conference Room B or HQ" value={location} onChangeText={setLocation} />
            <Select label="Project" value={projectId} onChange={setProjectId} allowClear options={(layout?.projects ?? []).map((p) => ({ value: p.id, label: p.name }))} placeholder="Select project (optional)" />
            <Select
                label="Reminder Intimation"
                value={reminder}
                onChange={(v) => v && setReminder(v)}
                options={[
                    { value: "5", label: "5 minutes before" },
                    { value: "10", label: "10 minutes before" },
                    { value: "15", label: "15 minutes before" },
                    { value: "30", label: "30 minutes before" },
                    { value: "60", label: "1 hour before" },
                ]}
            />
            <MultiSelect
                label="Attendees"
                values={attendees}
                onChange={setAttendees}
                searchable
                options={(members.data ?? []).filter((m: any) => m.userId !== myId).map((m: any) => ({ value: m.userId, label: displayName(m.user ?? m) }))}
                placeholder="Invite members"
            />
            <Input label="Agenda / description" multiline value={description} onChangeText={setDescription} />
            <Text variant="caption" tone="muted">
                {format(start, "EEE, dd MMM")} {isAllDay ? "· all day" : `· ${fmtTime(start)} – ${fmtTime(end)}`}
            </Text>
        </Sheet>
    );
}
