import React, { useEffect, useState } from "react";
import {
    View,
    Text,
    StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SPACING, BORDER_RADIUS, FONTS } from "../constants/theme";
import { useTheme } from "../context/ThemeContext";
import { getStatusHex, getStatusBgColor } from "../utils/taskColors";
import Sheet from "./Sheet";
import PressableScale from "./PressableScale";
import { haptics } from "../services/haptics";
import { getProjectPermissions, ProjectPermissions } from "../services/api";
import { getStatusPermission } from "../utils/statusPermissions";

interface StatusPickerModalProps {
    visible: boolean;
    onClose: () => void;
    onSelect: (status: string) => void;
    currentStatus: string;
    onMorePress?: () => void;
    /**
     * Permission context. Supplying these lets the sheet disable statuses the
     * server would reject — the web client gates the same way, so the user sees
     * a greyed-out option with a reason instead of a Forbidden error toast.
     * Omit them and every option stays enabled, deferring to the server.
     */
    projectId?: string | null;
    workspaceId?: string | null;
    currentUserId?: string | null;
    assigneeId?: string | null;
    createdById?: string | null;
}

export default function StatusPickerModal({
    visible,
    onClose,
    onSelect,
    currentStatus,
    onMorePress,
    projectId,
    workspaceId,
    currentUserId,
    assigneeId,
    createdById,
}: StatusPickerModalProps) {
    const { colors, isDark } = useTheme();
    const [permissions, setPermissions] = useState<ProjectPermissions | null>(null);

    useEffect(() => {
        if (!visible || !projectId || !workspaceId) return;
        let alive = true;
        getProjectPermissions(projectId, workspaceId).then((p) => {
            if (alive) setPermissions(p);
        });
        return () => { alive = false; };
    }, [visible, projectId, workspaceId]);

    const STATUS_OPTIONS = [
        { id: "TO_DO", label: "To Do", icon: "list-outline", color: getStatusHex("TO_DO") },
        { id: "IN_PROGRESS", label: "In Progress", icon: "play-circle-outline", color: getStatusHex("IN_PROGRESS") },
        { id: "REVIEW", label: "Review", icon: "eye-outline", color: getStatusHex("REVIEW") },
        { id: "HOLD", label: "Hold", icon: "pause-circle-outline", color: getStatusHex("HOLD") },
        { id: "COMPLETED", label: "Completed", icon: "checkbox-outline", color: getStatusHex("COMPLETED") },
        { id: "CANCELLED", label: "Cancelled", icon: "close-circle-outline", color: getStatusHex("CANCELLED") },
    ];

    return (
        <Sheet visible={visible} onClose={onClose} accessibilityLabel="Update status">
            <View style={styles.headerRow}>
                <View style={{ width: 40 }} />
                <Text style={[styles.title, { color: colors.text }]}>Update Status</Text>
                {onMorePress ? (
                    <PressableScale
                        haptic="selection"
                        style={styles.moreButton}
                        onPress={() => {
                            onClose();
                            onMorePress();
                        }}
                        accessibilityLabel="More options"
                    >
                        <Ionicons name="ellipsis-horizontal" size={20} color={colors.text} />
                    </PressableScale>
                ) : (
                    <View style={{ width: 40 }} />
                )}
            </View>

            <View style={styles.content}>
                {STATUS_OPTIONS.map((opt) => {
                    const isSelected = currentStatus === opt.id;
                    // Workflow rule (existing) plus the permission rule the
                    // server enforces, so a disallowed status is greyed out here
                    // rather than failing on submit.
                    const workflowBlocked = (currentStatus === "TO_DO" && (opt.id === "REVIEW" || opt.id === "COMPLETED")) ||
                                     (currentStatus === "IN_PROGRESS" && opt.id === "COMPLETED");
                    const permission = getStatusPermission(opt.id, {
                        permissions,
                        currentUserId,
                        assigneeId,
                        createdById,
                        currentStatus,
                    });
                    const isDisabled = workflowBlocked || !permission.allowed;

                    return (
                        <PressableScale
                            key={opt.id}
                            haptic={null}
                            disabled={isDisabled}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: isSelected, disabled: isDisabled }}
                            accessibilityLabel={opt.label}
                            style={[
                                styles.statusItem,
                                isSelected && { backgroundColor: isDark ? colors.activeTab : "#e0e7ff" },
                                isDisabled && { opacity: !permission.allowed ? 0.55 : 0.3 }
                            ]}
                            onPress={() => {
                                haptics.selection();
                                onSelect(opt.id);
                                onClose();
                            }}
                        >
                            <View style={[styles.iconBox, { backgroundColor: getStatusBgColor(opt.id) }]}>
                                <Ionicons name={opt.icon as any} size={20} color={opt.color} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={[
                                    styles.statusLabel,
                                    { color: colors.text },
                                    isSelected && { color: colors.primary, fontFamily: FONTS.bold }
                                ]}>
                                    {opt.label}
                                </Text>
                                {!permission.allowed && permission.reason ? (
                                    <Text style={[styles.reason, { color: colors.textDim }]}>
                                        {permission.reason}
                                    </Text>
                                ) : null}
                            </View>
                            {isSelected && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
                        </PressableScale>
                    );
                })}
            </View>
        </Sheet>
    );
}

const styles = StyleSheet.create({
    headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%", paddingHorizontal: SPACING.md, paddingBottom: 12 },
    title: { fontSize: 18, fontFamily: FONTS.bold },
    moreButton: { width: 40, height: 40, borderRadius: 20, justifyContent: "center", alignItems: "center" },

    content: { paddingHorizontal: SPACING.md, paddingTop: 4 },
    statusItem: {
        flexDirection: "row",
        alignItems: "center",
        padding: SPACING.md,
        borderRadius: BORDER_RADIUS.lg,
        marginBottom: 4,
    },
    iconBox: { width: 36, height: 36, borderRadius: 10, justifyContent: "center", alignItems: "center", marginRight: SPACING.md },
    statusLabel: { fontSize: 16, fontFamily: FONTS.medium },
    reason: { fontSize: 11, fontFamily: FONTS.regular, lineHeight: 15, marginTop: 2 },
});
