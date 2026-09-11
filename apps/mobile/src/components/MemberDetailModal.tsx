import React from "react";
import { View, Text, StyleSheet, Modal, Image, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { format } from "date-fns";
import { SafeAreaView } from "react-native-safe-area-context";
import { SPACING, BORDER_RADIUS, FONTS, TOUCH_TARGET } from "../constants/theme";
import { useTheme } from "../context/ThemeContext";
import { WorkspaceMember } from "../types";
import PressableScale from "./PressableScale";
import StatusChip from "./StatusChip";
import { getUserDisplayName, getUserDisplayInitial } from "../utils/userDisplayName";

interface MemberDetailModalProps {
    member: WorkspaceMember | null;
    /** Workload is management information — owners, admins and managers only (matches the web dashboard). */
    canSeeWorkload?: boolean;
    onClose: () => void;
    onMessage: (member: WorkspaceMember) => void;
}

/** One labelled cell of the detail grid — mirrors the web team dashboard's member dialog. */
function Field({ label, value, icon }: { label: string; value?: string | null; icon: keyof typeof Ionicons.glyphMap }) {
    const { colors } = useTheme();
    if (!value) return null;
    return (
        <View style={[styles.field, { backgroundColor: colors.surfaceHighlight, borderColor: colors.border }]}>
            <View style={styles.fieldLabelRow}>
                <Ionicons name={icon} size={11} color={colors.textDim} />
                <Text style={[styles.fieldLabel, { color: colors.textDim }]}>{label}</Text>
            </View>
            <Text style={[styles.fieldValue, { color: colors.text }]} numberOfLines={2}>
                {value}
            </Text>
        </View>
    );
}

export default function MemberDetailModal({ member, canSeeWorkload, onClose, onMessage }: MemberDetailModalProps) {
    const { colors, isDark } = useTheme();
    if (!member) return null;

    // `surname` is where the app stores a member's nickname, not a family
    // name — prefer it, don't stitch it onto `name` (see utils/userDisplayName).
    const displayName = getUserDisplayName(member.user);
    const initials = getUserDisplayInitial(member.user);
    const role = member.workspaceRole.charAt(0) + member.workspaceRole.slice(1).toLowerCase().replace(/_/g, " ");
    const isVerified = member.status === "Verified";
    const dob = member.dateOfBirth
        ? (() => {
              try {
                  return format(new Date(member.dateOfBirth as string), "d MMM yyyy");
              } catch {
                  return null;
              }
          })()
        : null;
    const hasLeaveBalance = member.casualLeaveBalance !== undefined || member.sickLeaveBalance !== undefined;

    return (
        <Modal visible={!!member} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
            <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top"]}>
                <View style={styles.header}>
                    <Text style={[styles.headerTitle, { color: colors.text }]}>Member Details</Text>
                    <PressableScale onPress={onClose} style={styles.closeBtn} accessibilityLabel="Close">
                        <Ionicons name="close" size={24} color={colors.text} />
                    </PressableScale>
                </View>

                <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                    <View style={styles.profileRow}>
                        <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
                            {member.user.image ? (
                                <Image source={{ uri: member.user.image }} style={styles.avatarImage} />
                            ) : (
                                <Text style={styles.avatarText}>{initials}</Text>
                            )}
                        </View>
                        <View style={styles.profileInfo}>
                            <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                                {displayName}
                            </Text>
                            <Text style={[styles.email, { color: colors.textDim }]} numberOfLines={1}>
                                {member.user.email}
                            </Text>
                            {member.designation && (
                                <Text style={[styles.designation, { color: colors.textDim }]} numberOfLines={1}>
                                    {member.designation}
                                </Text>
                            )}
                        </View>
                        {member.status && (
                            <StatusChip label={member.status} kind={isVerified ? "success" : "warning"} size="sm" />
                        )}
                    </View>

                    <View style={styles.grid}>
                        <Field label="Role" value={role} icon="shield-checkmark-outline" />
                        <Field label="Department" value={member.departmentName} icon="business-outline" />
                        <Field label="Employee ID" value={member.employeeId} icon="pricetag-outline" />
                        <Field label="Phone" value={member.phoneNumber} icon="call-outline" />
                        <Field label="Date of Birth" value={dob} icon="calendar-outline" />
                        <Field label="Reports To" value={member.reportToName} icon="person-outline" />
                        {canSeeWorkload && member.openTaskCount !== undefined && (
                            <Field label="Open Tasks" value={String(member.openTaskCount)} icon="checkbox-outline" />
                        )}
                    </View>

                    {hasLeaveBalance && (
                        <View style={styles.leaveSection}>
                            <Text style={[styles.sectionLabel, { color: colors.textDim }]}>Leave Balance</Text>
                            <View style={styles.leaveRow}>
                                <View style={[styles.leaveCard, { backgroundColor: colors.surfaceHighlight, borderColor: colors.border }]}>
                                    <View style={styles.leaveLabelRow}>
                                        <View style={[styles.leaveDot, { backgroundColor: "#3b82f6" }]} />
                                        <Text style={[styles.leaveLabel, { color: colors.textDim }]}>Casual</Text>
                                    </View>
                                    <Text style={[styles.leaveValue, { color: colors.text }]}>
                                        {member.casualLeaveBalance ?? 0} days
                                    </Text>
                                </View>
                                <View style={[styles.leaveCard, { backgroundColor: colors.surfaceHighlight, borderColor: colors.border }]}>
                                    <View style={styles.leaveLabelRow}>
                                        <View style={[styles.leaveDot, { backgroundColor: "#f43f5e" }]} />
                                        <Text style={[styles.leaveLabel, { color: colors.textDim }]}>Sick</Text>
                                    </View>
                                    <Text style={[styles.leaveValue, { color: colors.text }]}>
                                        {member.sickLeaveBalance ?? 0} days
                                    </Text>
                                </View>
                            </View>
                        </View>
                    )}
                </ScrollView>

                <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
                    <PressableScale
                        haptic="light"
                        style={[styles.messageBtn, { backgroundColor: colors.primary }]}
                        onPress={() => onMessage(member)}
                        accessibilityLabel={`Message ${displayName}`}
                    >
                        <Ionicons name="chatbubble-ellipses" size={18} color="#fff" />
                        <Text style={styles.messageBtnText}>Message</Text>
                    </PressableScale>
                </View>
            </SafeAreaView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingVertical: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: "rgba(0,0,0,0.1)",
    },
    headerTitle: { fontSize: 18, fontFamily: FONTS.bold },
    closeBtn: { width: TOUCH_TARGET.min, height: TOUCH_TARGET.min, alignItems: "flex-end", justifyContent: "center" },

    scrollContent: { padding: SPACING.lg, paddingBottom: SPACING.xxl, gap: SPACING.lg },

    profileRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    avatar: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
    avatarImage: { width: 56, height: 56, borderRadius: 28 },
    avatarText: { color: "#fff", fontSize: 20, fontFamily: FONTS.bold },
    profileInfo: { flex: 1 },
    name: { fontSize: 18, fontFamily: FONTS.bold },
    email: { fontSize: 13, fontFamily: FONTS.regular, marginTop: 2 },
    designation: { fontSize: 12, fontFamily: FONTS.regular, marginTop: 2 },

    grid: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
    field: { width: "47%", borderWidth: 1, borderRadius: BORDER_RADIUS.md, padding: SPACING.sm + 2, gap: 4 },
    fieldLabelRow: { flexDirection: "row", alignItems: "center", gap: 4 },
    fieldLabel: { fontSize: 10, fontFamily: FONTS.bold, textTransform: "uppercase", letterSpacing: 0.4 },
    fieldValue: { fontSize: 14, fontFamily: FONTS.semibold },

    leaveSection: { gap: SPACING.sm },
    sectionLabel: { fontSize: 10, fontFamily: FONTS.bold, textTransform: "uppercase", letterSpacing: 0.4 },
    leaveRow: { flexDirection: "row", gap: SPACING.sm },
    leaveCard: { flex: 1, borderWidth: 1, borderRadius: BORDER_RADIUS.md, padding: SPACING.sm + 2, gap: 4 },
    leaveLabelRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    leaveDot: { width: 8, height: 8, borderRadius: 4 },
    leaveLabel: { fontSize: 10, fontFamily: FONTS.bold, textTransform: "uppercase", letterSpacing: 0.4 },
    leaveValue: { fontSize: 15, fontFamily: FONTS.bold },

    footer: { padding: SPACING.lg, borderTopWidth: StyleSheet.hairlineWidth },
    messageBtn: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        height: 50,
        borderRadius: BORDER_RADIUS.full,
    },
    messageBtnText: { color: "#fff", fontSize: 15, fontFamily: FONTS.bold },
});
