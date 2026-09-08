import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Sheet from "../../components/Sheet";
import AppButton from "../../components/AppButton";
import ConfirmationSheet from "../../components/ConfirmationSheet";
import StatusChip, { StatusKind } from "../../components/StatusChip";
import { SPACING, BORDER_RADIUS, FONTS } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import { useToast } from "../../context/ToastContext";
import { haptics } from "../../services/haptics";
import { deleteMeeting, rsvpMeeting, updateMeeting } from "../../services/api";
import { Meeting, RsvpStatus } from "../../types";

function statusKind(status: Meeting["status"]): StatusKind {
    switch (status) {
        case "COMPLETED": return "completed";
        case "IN_PROGRESS": return "inProgress";
        case "CANCELLED": return "cancelled";
        default: return "todo";
    }
}

export default function MeetingDetailsSheet({
    meeting,
    workspaceId,
    currentUserId,
    onClose,
    onUpdated,
    onDeleted,
}: {
    meeting: Meeting | null;
    workspaceId: string;
    currentUserId?: string;
    onClose: () => void;
    onUpdated: (meeting: Meeting) => void;
    onDeleted: (id: string) => void;
}) {
    const { colors } = useTheme();
    const toast = useToast();
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [busyStatus, setBusyStatus] = useState(false);

    if (!meeting) return null;

    const isOrganizer = meeting.organizerId === currentUserId;
    const currentAttendee = meeting.attendees?.find((a) => a.userId === currentUserId);
    const start = new Date(meeting.startTime);
    const end = new Date(meeting.endTime);
    const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60000);

    const handleRsvp = async (status: RsvpStatus) => {
        if (!currentUserId) return;
        haptics.selection();
        const optimistic: Meeting = {
            ...meeting,
            attendees: meeting.attendees.map((a) => (a.userId === currentUserId ? { ...a, status } : a)),
        };
        onUpdated(optimistic);
        try {
            await rsvpMeeting(meeting.id, status);
            toast.success(`RSVP updated: ${status.toLowerCase()}`);
        } catch (e: any) {
            toast.error(e.message || "Failed to update RSVP");
        }
    };

    const handleDelete = async () => {
        setDeleting(true);
        try {
            await deleteMeeting(meeting.id, workspaceId);
            haptics.success();
            toast.success("Meeting deleted");
            setConfirmDelete(false);
            onDeleted(meeting.id);
            onClose();
        } catch (e: any) {
            haptics.error();
            toast.error(e.message || "Failed to delete meeting");
        } finally {
            setDeleting(false);
        }
    };

    const handleMarkCompleted = async () => {
        setBusyStatus(true);
        try {
            const updated = await updateMeeting(meeting.id, workspaceId, { status: "COMPLETED" });
            onUpdated(updated);
            toast.success("Meeting marked completed");
        } catch (e: any) {
            toast.error(e.message || "Failed to update status");
        } finally {
            setBusyStatus(false);
        }
    };

    return (
        <>
            <Sheet visible={!!meeting && !confirmDelete} onClose={onClose} accessibilityLabel="Meeting details">
                <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
                    <View style={styles.badgeRow}>
                        <View style={[styles.typeBadge, { borderColor: colors.border }]}>
                            <Text style={[styles.typeBadgeText, { color: colors.textMuted }]}>
                                {meeting.type.replace(/_/g, " ")}
                            </Text>
                        </View>
                        <StatusChip label={meeting.status.replace(/_/g, " ")} kind={statusKind(meeting.status)} size="sm" />
                        {meeting.project && (
                            <View style={[styles.typeBadge, { borderColor: colors.primary + "40" }]}>
                                <Ionicons name="briefcase-outline" size={10} color={colors.primary} />
                                <Text style={[styles.typeBadgeText, { color: colors.primary }]}>{meeting.project.name}</Text>
                            </View>
                        )}
                    </View>

                    <Text style={[styles.title, { color: colors.text }]}>{meeting.title}</Text>

                    <View style={[styles.timeCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
                        <View style={styles.timeCardRow}>
                            <Ionicons name="calendar-outline" size={15} color={colors.primary} />
                            <Text style={[styles.timeCardDate, { color: colors.text }]}>
                                {start.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                            </Text>
                        </View>
                        <View style={styles.timeCardBottom}>
                            <View style={styles.timeCardRow}>
                                <Ionicons name="time-outline" size={13} color={colors.textDim} />
                                <Text style={[styles.timeCardTime, { color: colors.textDim }]}>
                                    {start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} – {end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                </Text>
                            </View>
                            <View style={[styles.durationPill, { backgroundColor: colors.surfaceHighlight }]}>
                                <Text style={[styles.durationPillText, { color: colors.text }]}>
                                    {durationMinutes >= 60 ? `${(durationMinutes / 60).toFixed(1)}h` : `${durationMinutes}m`}
                                </Text>
                            </View>
                        </View>
                    </View>

                    {meeting.meetingUrl && (
                        <AppButton
                            label="Join Video Call"
                            icon="videocam"
                            onPress={() => Linking.openURL(meeting.meetingUrl!)}
                            fullWidth
                            style={{ marginTop: SPACING.md }}
                        />
                    )}

                    {meeting.location && (
                        <View style={[styles.infoRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
                            <Ionicons name="location-outline" size={15} color={colors.primary} />
                            <Text style={[styles.infoText, { color: colors.text }]}>{meeting.location}</Text>
                        </View>
                    )}

                    {meeting.description && (
                        <>
                            <Text style={[styles.sectionLabel, { color: colors.textDim }]}>Agenda / Notes</Text>
                            <Text style={[styles.description, { color: colors.textMuted, backgroundColor: colors.background, borderColor: colors.border }]}>
                                {meeting.description}
                            </Text>
                        </>
                    )}

                    {currentAttendee && (
                        <View style={[styles.rsvpCard, { backgroundColor: colors.primary + "0d", borderColor: colors.primary + "30" }]}>
                            <Text style={[styles.rsvpLabel, { color: colors.primary }]}>Your Attendance</Text>
                            <View style={styles.rsvpRow}>
                                {([
                                    { status: "ACCEPTED" as const, label: "Going" },
                                    { status: "TENTATIVE" as const, label: "Maybe" },
                                    { status: "DECLINED" as const, label: "Decline" },
                                ]).map((o) => {
                                    const active = currentAttendee.status === o.status;
                                    return (
                                        <TouchableOpacity
                                            key={o.status}
                                            onPress={() => handleRsvp(o.status)}
                                            style={[
                                                styles.rsvpChip,
                                                { borderColor: colors.border, backgroundColor: colors.surface },
                                                active && { backgroundColor: colors.primary, borderColor: colors.primary },
                                            ]}
                                        >
                                            <Text style={[styles.rsvpChipText, { color: active ? "#fff" : colors.textMuted }]}>{o.label}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </View>
                    )}

                    <View style={styles.sectionHeaderRow}>
                        <Text style={[styles.sectionLabel, { color: colors.textDim, marginTop: 0 }]}>
                            Participants ({meeting.attendees?.length ?? 0})
                        </Text>
                    </View>
                    <View style={[styles.attendeesList, { borderColor: colors.border }]}>
                        {meeting.attendees?.map((att) => {
                            const name = att.user?.surname || att.user?.name || "Participant";
                            const isHost = att.userId === meeting.organizerId;
                            return (
                                <View key={att.id} style={[styles.attendeeRow, { borderBottomColor: colors.border }]}>
                                    <View style={[styles.attendeeAvatar, { backgroundColor: colors.surfaceHighlight }]}>
                                        {att.user?.image ? (
                                            <Image source={{ uri: att.user.image }} style={styles.attendeeAvatarImg} />
                                        ) : (
                                            <Text style={[styles.attendeeAvatarTxt, { color: colors.textDim }]}>{name[0]?.toUpperCase()}</Text>
                                        )}
                                    </View>
                                    <View style={{ flex: 1, minWidth: 0 }}>
                                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                                            <Text style={[styles.attendeeName, { color: colors.text }]} numberOfLines={1}>{name}</Text>
                                            {isHost && (
                                                <View style={[styles.hostBadge, { backgroundColor: colors.surfaceHighlight }]}>
                                                    <Text style={[styles.hostBadgeText, { color: colors.textDim }]}>Host</Text>
                                                </View>
                                            )}
                                        </View>
                                        {att.user?.email && (
                                            <Text style={[styles.attendeeEmail, { color: colors.textDim }]} numberOfLines={1}>{att.user.email}</Text>
                                        )}
                                    </View>
                                    <StatusChip
                                        label={att.status.toLowerCase()}
                                        kind={att.status === "ACCEPTED" ? "success" : att.status === "DECLINED" ? "error" : "neutral"}
                                        size="sm"
                                    />
                                </View>
                            );
                        })}
                    </View>

                    {isOrganizer && (
                        <View style={styles.organizerActions}>
                            <AppButton
                                label="Delete Meeting"
                                icon="trash-outline"
                                variant="destructive"
                                size="sm"
                                onPress={() => setConfirmDelete(true)}
                                style={{ flex: 1 }}
                            />
                            {meeting.status !== "COMPLETED" && (
                                <AppButton
                                    label="Mark Completed"
                                    variant="secondary"
                                    size="sm"
                                    loading={busyStatus}
                                    onPress={handleMarkCompleted}
                                    style={{ flex: 1 }}
                                />
                            )}
                        </View>
                    )}

                    <View style={{ height: SPACING.lg }} />
                </ScrollView>
            </Sheet>

            <ConfirmationSheet
                visible={confirmDelete}
                title="Cancel and delete this meeting?"
                description={`This will permanently delete "${meeting.title}" and notify attendees.`}
                tone="destructive"
                confirmLabel="Delete"
                cancelLabel="Keep Meeting"
                loading={deleting}
                onConfirm={handleDelete}
                onClose={() => setConfirmDelete(false)}
            />
        </>
    );
}

const styles = StyleSheet.create({
    body: { paddingHorizontal: SPACING.lg },
    badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: SPACING.sm },
    typeBadge: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderRadius: BORDER_RADIUS.full, paddingHorizontal: 9, paddingVertical: 3 },
    typeBadgeText: { fontSize: 10, fontFamily: FONTS.bold, textTransform: "capitalize" },
    title: { fontSize: 21, fontFamily: FONTS.extrabold, marginBottom: SPACING.md },

    timeCard: { borderWidth: 1, borderRadius: BORDER_RADIUS.lg, padding: SPACING.md, gap: 8 },
    timeCardRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    timeCardDate: { fontSize: 14, fontFamily: FONTS.bold },
    timeCardBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    timeCardTime: { fontSize: 12, fontFamily: FONTS.medium },
    durationPill: { borderRadius: BORDER_RADIUS.sm, paddingHorizontal: 8, paddingVertical: 3 },
    durationPillText: { fontSize: 11, fontFamily: FONTS.bold },

    infoRow: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, marginTop: SPACING.md },
    infoText: { fontSize: 13, fontFamily: FONTS.semibold, flex: 1 },

    sectionLabel: { fontSize: 11, fontFamily: FONTS.bold, textTransform: "uppercase", letterSpacing: 0.3, marginTop: SPACING.md, marginBottom: 6 },
    description: { fontSize: 13, lineHeight: 19, borderWidth: 1, borderRadius: BORDER_RADIUS.md, padding: SPACING.md },

    rsvpCard: { borderWidth: 1, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, marginTop: SPACING.md, gap: 8 },
    rsvpLabel: { fontSize: 11, fontFamily: FONTS.bold },
    rsvpRow: { flexDirection: "row", gap: 8 },
    rsvpChip: { flex: 1, borderWidth: 1, borderRadius: BORDER_RADIUS.sm, paddingVertical: 8, alignItems: "center" },
    rsvpChipText: { fontSize: 12, fontFamily: FONTS.bold },

    sectionHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    attendeesList: { borderWidth: 1, borderRadius: BORDER_RADIUS.md, overflow: "hidden", maxHeight: 220 },
    attendeeRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: SPACING.sm, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
    attendeeAvatar: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", overflow: "hidden" },
    attendeeAvatarImg: { width: "100%", height: "100%" },
    attendeeAvatarTxt: { fontSize: 11, fontFamily: FONTS.bold },
    attendeeName: { fontSize: 13, fontFamily: FONTS.semibold },
    attendeeEmail: { fontSize: 10, marginTop: 1 },
    hostBadge: { borderRadius: BORDER_RADIUS.sm, paddingHorizontal: 6, paddingVertical: 1 },
    hostBadgeText: { fontSize: 9, fontFamily: FONTS.bold },

    organizerActions: { flexDirection: "row", gap: 10, marginTop: SPACING.lg },
});
