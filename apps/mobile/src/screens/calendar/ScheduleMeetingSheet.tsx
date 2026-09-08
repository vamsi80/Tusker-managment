import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Image, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import Sheet from "../../components/Sheet";
import AppButton from "../../components/AppButton";
import { SPACING, BORDER_RADIUS, FONTS } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import { useWorkspace } from "../../context/WorkspaceContext";
import { useToast } from "../../context/ToastContext";
import { haptics } from "../../services/haptics";
import { getWorkspaceMembers, createMeeting } from "../../services/api";
import { Meeting, MeetingType, WorkspaceMember } from "../../types";

const MEETING_TYPES: { value: MeetingType; label: string }[] = [
    { value: "INTERNAL", label: "Internal" },
    { value: "CLIENT", label: "Client" },
    { value: "PROJECT_REVIEW", label: "Review" },
    { value: "ONE_ON_ONE", label: "1-on-1" },
    { value: "GENERAL", label: "General" },
];

const COLOR_OPTIONS = ["#6366f1", "#10b981", "#f59e0b", "#f43f5e", "#0ea5e9", "#8b5cf6"];
const DURATIONS = [15, 30, 45, 60, 90];
const REMINDERS = [5, 10, 15, 30, 60];

function combineDateAndTime(date: Date, time: Date): Date {
    const d = new Date(date);
    d.setHours(time.getHours(), time.getMinutes(), 0, 0);
    return d;
}

export default function ScheduleMeetingSheet({
    visible,
    workspaceId,
    defaults,
    onClose,
    onCreated,
}: {
    visible: boolean;
    workspaceId: string;
    defaults: { date?: Date; time?: string } | null;
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

    useEffect(() => {
        if (!visible) return;

        getWorkspaceMembers(workspaceId).then(setMembers).catch(() => setMembers([]));

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

    const handleSubmit = async () => {
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

        setSubmitting(true);
        try {
            const meeting = await createMeeting({
                workspaceId,
                title: title.trim(),
                description: description.trim() || undefined,
                startTime: startDateTime.toISOString(),
                endTime: endDateTime.toISOString(),
                location: location.trim() || undefined,
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
                <TextInput
                    style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                    placeholder="e.g. Conference Room B"
                    placeholderTextColor={colors.textDim}
                    value={location}
                    onChangeText={setLocation}
                />

                {projects.length > 0 && (
                    <>
                        <Text style={[styles.label, { color: colors.textDim }]}>Associated Project</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
                            <View style={styles.chipRow}>
                                <TouchableOpacity
                                    onPress={() => setProjectId("none")}
                                    style={[
                                        styles.chip,
                                        { borderColor: colors.border },
                                        projectId === "none" && { backgroundColor: colors.primary, borderColor: colors.primary },
                                    ]}
                                >
                                    <Text style={[styles.chipText, { color: projectId === "none" ? "#fff" : colors.text }]}>None</Text>
                                </TouchableOpacity>
                                {projects.map((p) => (
                                    <TouchableOpacity
                                        key={p.id}
                                        onPress={() => setProjectId(p.id)}
                                        style={[
                                            styles.chip,
                                            { borderColor: colors.border },
                                            projectId === p.id && { backgroundColor: colors.primary, borderColor: colors.primary },
                                        ]}
                                    >
                                        <Text style={[styles.chipText, { color: projectId === p.id ? "#fff" : colors.text }]} numberOfLines={1}>
                                            {p.name}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </ScrollView>
                    </>
                )}

                <Text style={[styles.label, { color: colors.textDim }]}>Reminder</Text>
                <View style={styles.chipRow}>
                    {REMINDERS.map((mins) => (
                        <TouchableOpacity
                            key={mins}
                            onPress={() => setReminderMinutes(mins)}
                            style={[
                                styles.chip,
                                { borderColor: colors.border },
                                reminderMinutes === mins && { backgroundColor: colors.primary, borderColor: colors.primary },
                            ]}
                        >
                            <Text style={[styles.chipText, { color: reminderMinutes === mins ? "#fff" : colors.text }]}>
                                {mins >= 60 ? "1h before" : `${mins}m before`}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

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
