import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Image, Platform, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import Sheet from "../../components/Sheet";
import OptionPickerSheet, { PickerOption } from "../../components/OptionPickerSheet";
import AppButton from "../../components/AppButton";
import { SPACING, BORDER_RADIUS, FONTS } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import { useWorkspace } from "../../context/WorkspaceContext";
import { useToast } from "../../context/ToastContext";
import { haptics } from "../../services/haptics";
import { getWorkspaceMembers, createMeeting, getCachedSession } from "../../services/api";
import { getUserDisplayName } from "../../utils/userDisplayName";
import { Meeting, MeetingType, WorkspaceMember } from "../../types";

const MEETING_TYPES: { value: MeetingType; label: string }[] = [
    { value: "INTERNAL", label: "Internal" },
    { value: "CLIENT", label: "Client" },
    { value: "PROJECT_REVIEW", label: "Review" },
    { value: "ONE_ON_ONE", label: "1-on-1" },
    { value: "GENERAL", label: "General" },
];

/** The only bookable physical rooms — replaces free-text location entry. */
const LOCATIONS = ["Experience Center", "Lounge Area", "War Room"];

const COLOR_OPTIONS = ["#6366f1", "#10b981", "#f59e0b", "#f43f5e", "#0ea5e9", "#8b5cf6"];
const DURATIONS = [15, 30, 45, 60, 90];
const REMINDERS = [5, 10, 15, 30, 60];

/**
 * A meeting conflicts with the one being scheduled when their times overlap
 * AND they either share the room or share a person (any selected attendee,
 * or the creator themself). Time-only overlap with no shared room/person
 * isn't a conflict — two unrelated meetings can run in parallel.
 */
function findConflicts(
    meetings: Meeting[],
    startDateTime: Date,
    endDateTime: Date,
    location: string,
    involvedUserIds: string[]
): Meeting[] {
    return meetings.filter((m) => {
        if (m.status === "CANCELLED") return false;
        const mStart = new Date(m.startTime);
        const mEnd = new Date(m.endTime);
        const overlaps = mStart < endDateTime && mEnd > startDateTime;
        if (!overlaps) return false;

        const sameLocation = !!location && m.location === location;
        const attendeeIds = [m.organizerId, ...m.attendees.map((a) => a.userId)];
        const sharesPerson = attendeeIds.some((id) => involvedUserIds.includes(id));
        return sameLocation || sharesPerson;
    });
}

function combineDateAndTime(date: Date, time: Date): Date {
    const d = new Date(date);
    d.setHours(time.getHours(), time.getMinutes(), 0, 0);
    return d;
}

export default function ScheduleMeetingSheet({
    visible,
    workspaceId,
    defaults,
    meetings,
    onClose,
    onCreated,
}: {
    visible: boolean;
    workspaceId: string;
    defaults: { date?: Date; time?: string } | null;
    /** Full workspace meeting list (unbounded by date) — used for conflict detection. */
    meetings: Meeting[];
    onClose: () => void;
    onCreated: (meeting: Meeting) => void;
}) {
    const { colors, isDark } = useTheme();
    const { projects } = useWorkspace();
    const toast = useToast();

    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [meetingType, setMeetingType] = useState<MeetingType>("INTERNAL");
    const [color, setColor] = useState(COLOR_OPTIONS[0]);
    const [date, setDate] = useState(new Date());
    const [startTime, setStartTime] = useState(new Date());
    const [endTime, setEndTime] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showStartPicker, setShowStartPicker] = useState(false);
    const [showEndPicker, setShowEndPicker] = useState(false);
    const [meetingUrl, setMeetingUrl] = useState("");
    const [location, setLocation] = useState("");
    const [projectId, setProjectId] = useState<string>("none");
    const [reminderMinutes, setReminderMinutes] = useState(15);
    const [members, setMembers] = useState<WorkspaceMember[]>([]);
    const [memberSearch, setMemberSearch] = useState("");
    const [selectedAttendeeIds, setSelectedAttendeeIds] = useState<string[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [currentUserId, setCurrentUserId] = useState<string | undefined>();
    const [openPicker, setOpenPicker] = useState<"location" | "project" | "reminder" | null>(null);

    useEffect(() => {
        if (!visible) return;

        getWorkspaceMembers(workspaceId).then(setMembers).catch(() => setMembers([]));
        getCachedSession().then((s) => setCurrentUserId(s?.user?.id)).catch(() => {});

        const initialDate = defaults?.date ?? new Date();
        setDate(initialDate);

        if (defaults?.time) {
            const [h, m] = defaults.time.split(":").map(Number);
            const start = new Date(initialDate);
            start.setHours(h, m, 0, 0);
            setStartTime(start);
            const end = new Date(start);
            end.setHours(end.getHours() + 1);
            setEndTime(end);
        } else {
            const start = new Date();
            start.setMinutes(0, 0, 0);
            start.setHours(start.getHours() + 1);
            setStartTime(start);
            const end = new Date(start);
            end.setHours(end.getHours() + 1);
            setEndTime(end);
        }

        setTitle("");
        setDescription("");
        setMeetingType("INTERNAL");
        setColor(COLOR_OPTIONS[0]);
        setMeetingUrl("");
        setLocation("");
        setProjectId("none");
        setReminderMinutes(15);
        setSelectedAttendeeIds([]);
        setMemberSearch("");
    }, [visible, workspaceId, defaults]);

    const applyDuration = (minutes: number) => {
        const end = new Date(startTime.getTime() + minutes * 60000);
        setEndTime(end);
    };

    const toggleAttendee = (userId: string) => {
        haptics.selection();
        setSelectedAttendeeIds((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
    };

    const submitMeeting = async (startDateTime: Date, endDateTime: Date) => {
        setSubmitting(true);
        try {
            const meeting = await createMeeting({
                workspaceId,
                title: title.trim(),
                description: description.trim() || undefined,
                startTime: startDateTime.toISOString(),
                endTime: endDateTime.toISOString(),
                location: location || undefined,
                meetingUrl: meetingUrl.trim() || undefined,
                type: meetingType,
                color,
                projectId: projectId === "none" ? undefined : projectId,
                reminderMinutes,
                attendeeUserIds: selectedAttendeeIds,
            });
            haptics.success();
            toast.success("Meeting scheduled");
            onCreated(meeting);
            onClose();
        } catch (e: any) {
            haptics.error();
            toast.error(e.message || "Failed to schedule meeting");
        } finally {
            setSubmitting(false);
        }
    };

    const handleSubmit = () => {
        if (!title.trim()) {
            toast.error("Please provide a meeting title");
            return;
        }
        const startDateTime = combineDateAndTime(date, startTime);
        const endDateTime = combineDateAndTime(date, endTime);
        if (endDateTime <= startDateTime) {
            toast.error("End time must be after start time");
            return;
        }

        const involvedUserIds = currentUserId ? [currentUserId, ...selectedAttendeeIds] : selectedAttendeeIds;
        const conflicts = findConflicts(meetings, startDateTime, endDateTime, location, involvedUserIds);

        if (conflicts.length === 0) {
            submitMeeting(startDateTime, endDateTime);
            return;
        }

        haptics.error();
        const lines = conflicts.slice(0, 3).map((m) => {
            const reasons: string[] = [];
            if (location && m.location === location) reasons.push(`same room (${location})`);
            // The organizer is also stored as an attendee record, so dedupe by
            // userId — otherwise they'd be listed twice ("System, System").
            const peopleById = new Map<string, string>();
            if (m.organizerId && involvedUserIds.includes(m.organizerId)) {
                peopleById.set(m.organizerId, m.organizer ? getUserDisplayName(m.organizer) : "the organizer");
            }
            m.attendees
                .filter((a) => involvedUserIds.includes(a.userId))
                .forEach((a) => peopleById.set(a.userId, getUserDisplayName(a.user)));
            const attendeeNames = Array.from(peopleById.values());
            if (attendeeNames.length > 0) reasons.push(`clashes with ${attendeeNames.join(", ")}`);
            const time = new Date(m.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            return `• "${m.title}" at ${time} — ${reasons.join(" and ")}`;
        });
        const more = conflicts.length > 3 ? `\n…and ${conflicts.length - 3} more` : "";

        Alert.alert(
            "Scheduling conflict",
            `This overlaps with:\n${lines.join("\n")}${more}`,
            [
                { text: "Cancel", style: "cancel" },
                { text: "Schedule Anyway", style: "destructive", onPress: () => submitMeeting(startDateTime, endDateTime) },
            ]
        );
    };

    const locationOptions: PickerOption[] = LOCATIONS.map((loc) => ({ id: loc, label: loc }));
    const projectOptions: PickerOption[] = projects.map((p) => ({ id: p.id, label: p.name }));
    const reminderOptions: PickerOption[] = REMINDERS.map((mins) => ({
        id: String(mins),
        label: mins >= 60 ? "1h before" : `${mins}m before`,
    }));
    const selectedProjectName = projects.find((p) => p.id === projectId)?.name;
    const selectedReminderLabel = reminderOptions.find((o) => o.id === String(reminderMinutes))?.label ?? "15m before";

    const filteredMembers = members.filter((m) => {
        const name = `${m.user.surname || ""} ${m.user.name || ""} ${m.user.email || ""}`.toLowerCase();
        return name.includes(memberSearch.toLowerCase());
    });

    return (
        <Sheet visible={visible} onClose={onClose} accessibilityLabel="Schedule meeting">
            <ScrollView style={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <View style={styles.headerRow}>
                    <View style={[styles.headerIcon, { backgroundColor: colors.primary + "18" }]}>
                        <Ionicons name="calendar" size={18} color={colors.primary} />
                    </View>
                    <Text style={[styles.headerTitle, { color: colors.text }]}>Schedule Meeting</Text>
                </View>

                <Text style={[styles.label, { color: colors.textDim }]}>Title *</Text>
                <TextInput
                    style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                    placeholder="e.g., Weekly Sprint Planning"
                    placeholderTextColor={colors.textDim}
                    value={title}
                    onChangeText={setTitle}
                />

                <Text style={[styles.label, { color: colors.textDim }]}>Meeting Type</Text>
                <View style={styles.chipRow}>
                    {MEETING_TYPES.map((t) => (
                        <TouchableOpacity
                            key={t.value}
                            onPress={() => setMeetingType(t.value)}
                            style={[
                                styles.chip,
                                { borderColor: colors.border },
                                meetingType === t.value && { backgroundColor: colors.primary, borderColor: colors.primary },
                            ]}
                        >
                            <Text style={[styles.chipText, { color: meetingType === t.value ? "#fff" : colors.text }]}>
                                {t.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                <Text style={[styles.label, { color: colors.textDim }]}>Color Tag</Text>
                <View style={styles.colorRow}>
                    {COLOR_OPTIONS.map((c) => (
                        <TouchableOpacity
                            key={c}
                            onPress={() => setColor(c)}
                            style={[styles.colorDot, { backgroundColor: c }, color === c && styles.colorDotSelected]}
                        >
                            {color === c && <Ionicons name="checkmark" size={14} color="#fff" />}
                        </TouchableOpacity>
                    ))}
                </View>

                <View style={[styles.dateTimeCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <Text style={[styles.label, { color: colors.textDim, marginTop: 0 }]}>Date</Text>
                    <TouchableOpacity
                        style={[styles.pickerRow, { borderColor: colors.border }]}
                        onPress={() => {
                            setShowDatePicker((v) => !v);
                            setShowStartPicker(false);
                            setShowEndPicker(false);
                        }}
                    >
                        <Ionicons name="calendar-outline" size={16} color={colors.textDim} />
                        <Text style={[styles.pickerText, { color: colors.text }]}>
                            {date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                        </Text>
                    </TouchableOpacity>
                    {showDatePicker && (
                        <DateTimePicker
                            value={date}
                            mode="date"
                            display={Platform.OS === "ios" ? "spinner" : "default"}
                            textColor={colors.text}
                            themeVariant={isDark ? "dark" : "light"}
                            onChange={(_, d) => {
                                if (Platform.OS === "android") setShowDatePicker(false);
                                if (d) setDate(d);
                            }}
                        />
                    )}

                    <View style={styles.timeRow}>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.label, { color: colors.textDim }]}>Start</Text>
                            <TouchableOpacity
                                style={[styles.pickerRow, { borderColor: colors.border }]}
                                onPress={() => {
                                    setShowStartPicker((v) => !v);
                                    setShowDatePicker(false);
                                    setShowEndPicker(false);
                                }}
                            >
                                <Ionicons name="time-outline" size={16} color={colors.textDim} />
                                <Text style={[styles.pickerText, { color: colors.text }]}>
                                    {startTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                </Text>
                            </TouchableOpacity>
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.label, { color: colors.textDim }]}>End</Text>
                            <TouchableOpacity
                                style={[styles.pickerRow, { borderColor: colors.border }]}
                                onPress={() => {
                                    setShowEndPicker((v) => !v);
                                    setShowDatePicker(false);
                                    setShowStartPicker(false);
                                }}
                            >
                                <Ionicons name="time-outline" size={16} color={colors.textDim} />
                                <Text style={[styles.pickerText, { color: colors.text }]}>
                                    {endTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                    {showStartPicker && (
                        <DateTimePicker
                            value={startTime}
                            mode="time"
                            display={Platform.OS === "ios" ? "spinner" : "default"}
                            textColor={colors.text}
                            themeVariant={isDark ? "dark" : "light"}
                            onChange={(_, t) => {
                                if (Platform.OS === "android") setShowStartPicker(false);
                                if (t) setStartTime(t);
                            }}
                        />
                    )}
                    {showEndPicker && (
                        <DateTimePicker
                            value={endTime}
                            mode="time"
                            display={Platform.OS === "ios" ? "spinner" : "default"}
                            textColor={colors.text}
                            themeVariant={isDark ? "dark" : "light"}
                            onChange={(_, t) => {
                                if (Platform.OS === "android") setShowEndPicker(false);
                                if (t) setEndTime(t);
                            }}
                        />
                    )}

                    <View style={styles.durationRow}>
                        <Ionicons name="time-outline" size={13} color={colors.textDim} />
                        {DURATIONS.map((mins) => (
                            <TouchableOpacity
                                key={mins}
                                onPress={() => applyDuration(mins)}
                                style={[styles.durationChip, { borderColor: colors.border, backgroundColor: colors.surface }]}
                            >
                                <Text style={[styles.durationText, { color: colors.text }]}>
                                    {mins >= 60 ? `${mins / 60}h` : `${mins}m`}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                <Text style={[styles.label, { color: colors.textDim }]}>Video Call Link</Text>
                <TextInput
                    style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                    placeholder="e.g. meet.google.com/abc-xyz"
                    placeholderTextColor={colors.textDim}
                    value={meetingUrl}
                    onChangeText={setMeetingUrl}
                    autoCapitalize="none"
                />

                <Text style={[styles.label, { color: colors.textDim }]}>Physical Location</Text>
                <TouchableOpacity
                    style={[styles.selectTrigger, { backgroundColor: colors.background, borderColor: colors.border }]}
                    onPress={() => setOpenPicker("location")}
                    accessibilityRole="button"
                    accessibilityLabel={`Physical location: ${location || "none selected"}`}
                    accessibilityHint="Opens the location list"
                >
                    <Ionicons name="location-outline" size={16} color={colors.textDim} />
                    <Text style={[styles.selectValue, { color: location ? colors.text : colors.textDim }]} numberOfLines={1}>
                        {location || "None"}
                    </Text>
                    <Ionicons name="chevron-down" size={18} color={colors.textDim} />
                </TouchableOpacity>

                {projects.length > 0 && (
                    <>
                        <Text style={[styles.label, { color: colors.textDim }]}>Associated Project</Text>
                        <TouchableOpacity
                            style={[styles.selectTrigger, { backgroundColor: colors.background, borderColor: colors.border }]}
                            onPress={() => setOpenPicker("project")}
                            accessibilityRole="button"
                            accessibilityLabel={`Associated project: ${selectedProjectName || "none selected"}`}
                            accessibilityHint="Opens the project list"
                        >
                            <Ionicons name="folder-outline" size={16} color={colors.textDim} />
                            <Text style={[styles.selectValue, { color: selectedProjectName ? colors.text : colors.textDim }]} numberOfLines={1}>
                                {selectedProjectName || "None"}
                            </Text>
                            <Ionicons name="chevron-down" size={18} color={colors.textDim} />
                        </TouchableOpacity>
                    </>
                )}

                <Text style={[styles.label, { color: colors.textDim }]}>Reminder</Text>
                <TouchableOpacity
                    style={[styles.selectTrigger, { backgroundColor: colors.background, borderColor: colors.border }]}
                    onPress={() => setOpenPicker("reminder")}
                    accessibilityRole="button"
                    accessibilityLabel={`Reminder: ${selectedReminderLabel}`}
                    accessibilityHint="Opens the reminder list"
                >
                    <Ionicons name="notifications-outline" size={16} color={colors.textDim} />
                    <Text style={[styles.selectValue, { color: colors.text }]} numberOfLines={1}>
                        {selectedReminderLabel}
                    </Text>
                    <Ionicons name="chevron-down" size={18} color={colors.textDim} />
                </TouchableOpacity>

                <Text style={[styles.label, { color: colors.textDim }]}>Agenda / Description</Text>
                <TextInput
                    style={[styles.input, styles.textArea, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                    placeholder="Outline discussion points, action items..."
                    placeholderTextColor={colors.textDim}
                    value={description}
                    onChangeText={setDescription}
                    multiline
                    numberOfLines={3}
                />

                <View style={styles.attendeeHeader}>
                    <Text style={[styles.label, { color: colors.textDim, marginTop: 0 }]}>Invite Team Members</Text>
                    <Text style={[styles.attendeeCount, { color: colors.textDim }]}>{selectedAttendeeIds.length} selected</Text>
                </View>

                {selectedAttendeeIds.length > 0 && (
                    <View style={styles.pillsWrap}>
                        {selectedAttendeeIds.map((uid) => {
                            const member = members.find((m) => m.userId === uid);
                            const name = member?.user.surname || member?.user.name || "Member";
                            return (
                                <View key={uid} style={[styles.pill, { backgroundColor: colors.surfaceHighlight }]}>
                                    <Text style={[styles.pillText, { color: colors.text }]}>{name}</Text>
                                    <TouchableOpacity onPress={() => toggleAttendee(uid)} hitSlop={6}>
                                        <Ionicons name="close" size={13} color={colors.textDim} />
                                    </TouchableOpacity>
                                </View>
                            );
                        })}
                    </View>
                )}

                <View style={[styles.memberPicker, { borderColor: colors.border }]}>
                    <TextInput
                        style={[styles.memberSearchInput, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]}
                        placeholder="Search members to invite..."
                        placeholderTextColor={colors.textDim}
                        value={memberSearch}
                        onChangeText={setMemberSearch}
                    />
                    <ScrollView style={{ maxHeight: 160 }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                        {filteredMembers.length === 0 ? (
                            <Text style={[styles.emptyMembers, { color: colors.textDim }]}>No members found</Text>
                        ) : (
                            filteredMembers.map((m) => {
                                const isSelected = selectedAttendeeIds.includes(m.userId);
                                const name = m.user.surname || m.user.name || "Member";
                                return (
                                    <TouchableOpacity
                                        key={m.id}
                                        onPress={() => toggleAttendee(m.userId)}
                                        style={[styles.memberRow, isSelected && { backgroundColor: colors.primary + "12" }]}
                                    >
                                        <View style={[styles.memberAvatar, { backgroundColor: colors.surfaceHighlight }]}>
                                            {m.user.image ? (
                                                <Image source={{ uri: m.user.image }} style={styles.memberAvatarImg} />
                                            ) : (
                                                <Text style={[styles.memberAvatarTxt, { color: colors.textDim }]}>{name[0]?.toUpperCase()}</Text>
                                            )}
                                        </View>
                                        <Text style={[styles.memberName, { color: isSelected ? colors.primary : colors.text }]} numberOfLines={1}>
                                            {name}
                                        </Text>
                                        {isSelected && <Ionicons name="checkmark" size={16} color={colors.primary} />}
                                    </TouchableOpacity>
                                );
                            })
                        )}
                    </ScrollView>
                </View>

                <AppButton
                    label={submitting ? "Scheduling..." : "Schedule Meeting"}
                    icon="sparkles"
                    onPress={handleSubmit}
                    loading={submitting}
                    disabled={submitting}
                    fullWidth
                    style={{ marginTop: SPACING.lg, marginBottom: SPACING.sm }}
                />
            </ScrollView>

            <OptionPickerSheet
                visible={openPicker === "location"}
                onClose={() => setOpenPicker(null)}
                title="Physical Location"
                options={locationOptions}
                selectedId={location || null}
                onSelect={(id) => setLocation(id ?? "")}
                clearLabel="None"
            />

            <OptionPickerSheet
                visible={openPicker === "project"}
                onClose={() => setOpenPicker(null)}
                title="Associated Project"
                options={projectOptions}
                selectedId={projectId === "none" ? null : projectId}
                onSelect={(id) => setProjectId(id ?? "none")}
                clearLabel="None"
            />

            <OptionPickerSheet
                visible={openPicker === "reminder"}
                onClose={() => setOpenPicker(null)}
                title="Reminder"
                options={reminderOptions}
                selectedId={String(reminderMinutes)}
                onSelect={(id) => id && setReminderMinutes(Number(id))}
                clearLabel={null}
            />
        </Sheet>
    );
}

const styles = StyleSheet.create({
    body: { paddingHorizontal: SPACING.lg },
    headerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: SPACING.md },
    headerIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
    headerTitle: { fontSize: 18, fontFamily: FONTS.bold },

    label: { fontSize: 11, fontFamily: FONTS.bold, textTransform: "uppercase", letterSpacing: 0.3, marginTop: SPACING.md, marginBottom: 6 },
    input: { borderWidth: 1, borderRadius: BORDER_RADIUS.md, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14 },
    textArea: { height: 80, textAlignVertical: "top" },

    chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chip: { borderWidth: 1, borderRadius: BORDER_RADIUS.full, paddingHorizontal: 12, paddingVertical: 7 },
    chipText: { fontSize: 12, fontFamily: FONTS.semibold },

    selectTrigger: {
        flexDirection: "row",
        alignItems: "center",
        gap: SPACING.sm,
        minHeight: 44,
        paddingHorizontal: 12,
        borderRadius: BORDER_RADIUS.md,
        borderWidth: 1,
    },
    selectValue: { flex: 1, fontSize: 14, fontFamily: FONTS.medium },

    colorRow: { flexDirection: "row", gap: 10 },
    colorDot: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
    colorDotSelected: { borderWidth: 2, borderColor: "#fff" },

    dateTimeCard: { borderWidth: 1, borderRadius: BORDER_RADIUS.lg, padding: SPACING.md, marginTop: SPACING.md },
    pickerRow: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: BORDER_RADIUS.sm, paddingHorizontal: 10, paddingVertical: 10 },
    pickerText: { fontSize: 13, fontFamily: FONTS.semibold },
    timeRow: { flexDirection: "row", gap: 10, marginTop: SPACING.sm },
    durationRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: SPACING.sm, flexWrap: "wrap" },
    durationChip: { borderWidth: 1, borderRadius: BORDER_RADIUS.sm, paddingHorizontal: 9, paddingVertical: 4 },
    durationText: { fontSize: 11, fontFamily: FONTS.semibold },

    attendeeHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    attendeeCount: { fontSize: 11, marginTop: SPACING.md },
    pillsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
    pill: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: BORDER_RADIUS.full, paddingHorizontal: 10, paddingVertical: 5 },
    pillText: { fontSize: 12, fontFamily: FONTS.semibold },

    memberPicker: { borderWidth: 1, borderRadius: BORDER_RADIUS.md, padding: SPACING.sm },
    memberSearchInput: { borderWidth: 1, borderRadius: BORDER_RADIUS.sm, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, marginBottom: 6 },
    emptyMembers: { fontSize: 12, textAlign: "center", paddingVertical: 12 },
    memberRow: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: BORDER_RADIUS.sm, paddingHorizontal: 8, paddingVertical: 8 },
    memberAvatar: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", overflow: "hidden" },
    memberAvatarImg: { width: "100%", height: "100%" },
    memberAvatarTxt: { fontSize: 10, fontFamily: FONTS.bold },
    memberName: { fontSize: 13, fontFamily: FONTS.semibold, flex: 1 },
});
