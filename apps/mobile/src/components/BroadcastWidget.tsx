import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SPACING, BORDER_RADIUS, FONTS } from "../constants/theme";
import { useTheme } from "../context/ThemeContext";
import { useWorkspace } from "../context/WorkspaceContext";
import { useToast } from "../context/ToastContext";
import { haptics } from "../services/haptics";
import { getBroadcasts, postBroadcast, updateBroadcast, deleteBroadcast, getDepartments } from "../services/api";
import { BroadcastMessage, Department } from "../types";
import { Skeleton } from "./Skeleton";
import Sheet from "./Sheet";
import AppButton from "./AppButton";
import ConfirmationSheet from "./ConfirmationSheet";

const DURATION_OPTIONS: { label: string; value: number | null }[] = [
    { label: "1 day", value: 24 },
    { label: "3 days", value: 72 },
    { label: "1 week", value: 24 * 7 },
    { label: "30 days", value: 24 * 30 },
    { label: "Until removed", value: null },
];

/**
 * Workspace announcements — mirrors the web dashboard's BroadcastWidget.
 * Everyone reads; only owners/admins can post/edit/delete (the API enforces
 * it too, this just hides the composer). Department targeting, like web,
 * only applies when creating — editing never changes who it's addressed to.
 */
export default function BroadcastWidget({ workspaceId }: { workspaceId: string }) {
    const { colors } = useTheme();
    const { activeWorkspace } = useWorkspace();
    const toast = useToast();
    const canBroadcast = activeWorkspace?.workspaceRole === "ADMIN" || activeWorkspace?.workspaceRole === "OWNER";

    const [broadcasts, setBroadcasts] = useState<BroadcastMessage[] | null>(null);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [composerOpen, setComposerOpen] = useState(false);
    const [editing, setEditing] = useState<BroadcastMessage | null>(null);
    const [title, setTitle] = useState("");
    const [message, setMessage] = useState("");
    const [duration, setDuration] = useState<number | null>(null);
    /** Empty means the whole workspace — same convention as web. */
    const [deptIds, setDeptIds] = useState<string[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<BroadcastMessage | null>(null);
    const [deleting, setDeleting] = useState(false);

    const loadBroadcasts = useCallback(async () => {
        const data = await getBroadcasts(workspaceId, 10);
        setBroadcasts(data);
    }, [workspaceId]);

    useEffect(() => {
        if (workspaceId) loadBroadcasts();
    }, [workspaceId, loadBroadcasts]);

    useEffect(() => {
        if (!canBroadcast || !workspaceId) return;
        getDepartments(workspaceId).then(setDepartments);
    }, [workspaceId, canBroadcast]);

    const toggleDepartment = (id: string) => {
        haptics.selection();
        setDeptIds((prev) => (prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]));
    };

    const openComposer = (b?: BroadcastMessage) => {
        haptics.selection();
        if (b) {
            setEditing(b);
            setTitle(b.title || "");
            setMessage(b.body || "");
        } else {
            setEditing(null);
            setTitle("");
            setMessage("");
        }
        setDuration(null);
        setDeptIds([]);
        setComposerOpen(true);
    };

    const handleSubmit = async () => {
        const trimmedMessage = message.trim();
        if (!trimmedMessage) {
            toast.error("Please enter an announcement message");
            return;
        }
        setSubmitting(true);
        try {
            if (editing) {
                const id = editing.entityId || editing.id;
                await updateBroadcast(workspaceId, id, {
                    title: title.trim() || undefined,
                    message: trimmedMessage,
                    expiresInHours: duration,
                });
                toast.success("Announcement updated");
            } else {
                await postBroadcast(workspaceId, {
                    title: title.trim() || undefined,
                    message: trimmedMessage,
                    expiresInHours: duration,
                    departmentIds: deptIds,
                });
                haptics.success();
                toast.success("Announcement sent");
            }
            setComposerOpen(false);
            loadBroadcasts();
        } catch (e: any) {
            toast.error(e.message || "Failed to save announcement");
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            await deleteBroadcast(workspaceId, deleteTarget.entityId || deleteTarget.id);
            haptics.success();
            toast.success("Announcement deleted");
            setDeleteTarget(null);
            loadBroadcasts();
        } catch (e: any) {
            toast.error(e.message || "Failed to delete announcement");
        } finally {
            setDeleting(false);
        }
    };

    if (broadcasts === null) {
        return (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Skeleton width={140} height={12} />
                <View style={{ height: SPACING.md }} />
                <Skeleton width="75%" height={14} />
            </View>
        );
    }

    if (broadcasts.length === 0 && !canBroadcast) return null;

    return (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.header}>
                <View style={styles.headerIcon}>
                    <Ionicons name="megaphone-outline" size={20} color={colors.text} />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={[styles.headerTitle, { color: colors.text }]}>Announcements</Text>
                    <Text style={[styles.headerSubtitle, { color: colors.textDim }]}>
                        {broadcasts.length > 0 ? `${broadcasts.length} active` : "Workspace-wide"}
                    </Text>
                </View>
                {canBroadcast && (
                    <TouchableOpacity
                        style={[styles.addBtn, { backgroundColor: colors.primary }]}
                        onPress={() => openComposer()}
                        accessibilityRole="button"
                        accessibilityLabel="Post announcement"
                    >
                        <Ionicons name="add" size={18} color="#fff" />
                    </TouchableOpacity>
                )}
            </View>

            {broadcasts.length === 0 ? (
                <Text style={[styles.emptyText, { color: colors.textDim }]}>No announcements yet</Text>
            ) : (
                broadcasts.map((b) => {
                    const footerParts = [
                        b.metadata?.senderName || "Admin",
                        b.metadata?.departmentNames?.length ? `to ${b.metadata.departmentNames.join(", ")}` : null,
                        b.metadata?.expiresAt
                            ? `until ${new Date(b.metadata.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                            : null,
                    ].filter(Boolean);

                    return (
                        <View key={b.id} style={[styles.row, { borderTopColor: colors.border }]}>
                            <View style={styles.rowHeader}>
                                <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={1}>
                                    {b.title}
                                </Text>
                                <Text style={[styles.rowDate, { color: colors.textDim }]}>
                                    {new Date(b.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                </Text>
                            </View>
                            <Text style={[styles.rowBody, { color: colors.textMuted }]}>{b.body}</Text>
                            <View style={styles.rowFooterRow}>
                                <Text style={[styles.rowFooter, { color: colors.textDim }]} numberOfLines={1}>
                                    — {footerParts.join(" · ")}
                                </Text>
                                {canBroadcast && b.entityId && (
                                    <View style={styles.rowActions}>
                                        <TouchableOpacity onPress={() => openComposer(b)} hitSlop={8} accessibilityLabel="Edit announcement">
                                            <Ionicons name="pencil-outline" size={14} color={colors.textDim} />
                                        </TouchableOpacity>
                                        <TouchableOpacity onPress={() => setDeleteTarget(b)} hitSlop={8} accessibilityLabel="Delete announcement">
                                            <Ionicons name="trash-outline" size={14} color={colors.error} />
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </View>
                        </View>
                    );
                })
            )}

            <Sheet visible={composerOpen} onClose={() => setComposerOpen(false)} accessibilityLabel={editing ? "Edit announcement" : "Post announcement"}>
                <ScrollView style={styles.sheetBody} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                    <Text style={[styles.sheetTitle, { color: colors.text }]}>{editing ? "Edit Announcement" : "New Announcement"}</Text>

                    <Text style={[styles.label, { color: colors.textDim }]}>Title</Text>
                    <TextInput
                        style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                        placeholder="Announcement"
                        placeholderTextColor={colors.textDim}
                        value={title}
                        onChangeText={setTitle}
                        maxLength={120}
                    />

                    <Text style={[styles.label, { color: colors.textDim }]}>Message *</Text>
                    <TextInput
                        style={[styles.input, styles.textArea, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                        placeholder="What do you want the workspace to know?"
                        placeholderTextColor={colors.textDim}
                        value={message}
                        onChangeText={setMessage}
                        multiline
                        numberOfLines={5}
                        maxLength={2000}
                    />

                    {!editing && departments.length > 0 && (
                        <>
                            <Text style={[styles.label, { color: colors.textDim }]}>Send to</Text>
                            <View style={styles.durationRow}>
                                <TouchableOpacity
                                    onPress={() => setDeptIds([])}
                                    style={[
                                        styles.durationChip,
                                        { borderColor: colors.border },
                                        deptIds.length === 0 && { backgroundColor: colors.primary, borderColor: colors.primary },
                                    ]}
                                >
                                    <Text style={[styles.durationChipText, { color: deptIds.length === 0 ? "#fff" : colors.text }]}>Everyone</Text>
                                </TouchableOpacity>
                                {departments.map((dept) => {
                                    const selected = deptIds.includes(dept.id);
                                    return (
                                        <TouchableOpacity
                                            key={dept.id}
                                            onPress={() => toggleDepartment(dept.id)}
                                            style={[
                                                styles.durationChip,
                                                { borderColor: colors.border },
                                                selected && { backgroundColor: colors.primary, borderColor: colors.primary },
                                            ]}
                                        >
                                            <Text style={[styles.durationChipText, { color: selected ? "#fff" : colors.text }]}>{dept.name}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </>
                    )}

                    <Text style={[styles.label, { color: colors.textDim }]}>Visible for</Text>
                    <View style={styles.durationRow}>
                        {DURATION_OPTIONS.map((opt) => {
                            const selected = duration === opt.value;
                            return (
                                <TouchableOpacity
                                    key={opt.label}
                                    onPress={() => setDuration(opt.value)}
                                    style={[
                                        styles.durationChip,
                                        { borderColor: colors.border },
                                        selected && { backgroundColor: colors.primary, borderColor: colors.primary },
                                    ]}
                                >
                                    <Text style={[styles.durationChipText, { color: selected ? "#fff" : colors.text }]}>{opt.label}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    <AppButton
                        label={
                            submitting
                                ? "Sending..."
                                : editing
                                ? "Save changes"
                                : deptIds.length > 0
                                ? `Send to ${deptIds.length} department${deptIds.length > 1 ? "s" : ""}`
                                : "Send to everyone"
                        }
                        icon="megaphone-outline"
                        onPress={handleSubmit}
                        loading={submitting}
                        disabled={submitting}
                        fullWidth
                        style={{ marginTop: SPACING.lg, marginBottom: SPACING.sm }}
                    />
                </ScrollView>
            </Sheet>

            <ConfirmationSheet
                visible={!!deleteTarget}
                title="Delete this announcement?"
                description="It disappears for everyone in the workspace. This cannot be undone."
                tone="destructive"
                confirmLabel="Delete"
                cancelLabel="Cancel"
                loading={deleting}
                onConfirm={handleDelete}
                onClose={() => setDeleteTarget(null)}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        marginTop: SPACING.md,
        padding: 16,
        borderRadius: 20,
        borderWidth: 1,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 12,
        elevation: 2,
    },
    header: { flexDirection: "row", alignItems: "center" },
    headerIcon: { width: 22, alignItems: "center" },
    headerTitle: { fontSize: 15, fontFamily: FONTS.bold },
    headerSubtitle: { fontSize: 11, marginTop: 1 },
    addBtn: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },

    emptyText: { fontSize: 13, marginTop: SPACING.md, textAlign: "center" },

    row: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: SPACING.sm, marginTop: SPACING.sm },
    rowHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
    rowTitle: { fontSize: 14, fontFamily: FONTS.bold, flex: 1 },
    rowDate: { fontSize: 10, fontFamily: FONTS.semibold },
    rowBody: { fontSize: 13, lineHeight: 18, marginTop: 3 },
    rowFooterRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6, gap: 8 },
    rowFooter: { fontSize: 10, flex: 1 },
    rowActions: { flexDirection: "row", gap: 12 },

    sheetBody: { paddingHorizontal: SPACING.lg },
    sheetTitle: { fontSize: 18, fontFamily: FONTS.bold, marginBottom: SPACING.md },
    label: { fontSize: 11, fontFamily: FONTS.bold, textTransform: "uppercase", letterSpacing: 0.3, marginTop: SPACING.md, marginBottom: 6 },
    input: { borderWidth: 1, borderRadius: BORDER_RADIUS.md, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14 },
    textArea: { height: 110, textAlignVertical: "top" },
    durationRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    durationChip: { borderWidth: 1, borderRadius: BORDER_RADIUS.full, paddingHorizontal: 12, paddingVertical: 7 },
    durationChipText: { fontSize: 12, fontFamily: FONTS.semibold },
});
