import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../context/ThemeContext";
import { useWorkspace } from "../../context/WorkspaceContext";
import { SPACING, BORDER_RADIUS, FONTS } from "../../constants/theme";
import { ListSkeleton } from "../../components/ScreenSkeleton";
import PressableScale from "../../components/PressableScale";
import AppCard from "../../components/AppCard";
import AddMaterialSheet from "../../components/AddMaterialSheet";
import ConfirmationSheet from "../../components/ConfirmationSheet";
import {
    getProjectMaterials,
    addProjectMaterial,
    editProjectMaterial,
    deleteProjectMaterial,
    ProjectMaterialItem,
    ProjectMaterialSubtask,
    ProjectMaterialInput,
} from "../../services/api";

interface ProjectMaterialsScreenProps {
    projectId: string;
}

interface Section {
    key: string;
    title: string;
    subtitle?: string;
    subtaskId: string | null;
    materials: ProjectMaterialItem[];
}

/**
 * Materials planning tab — mirrors the web project Materials page
 * (apps/web .../p/[slug]/materials). Lists subtasks flagged for procurement
 * (requirePurchase tag, or a "procurement" tag) with the materials recorded
 * against each, plus an "Uncategorized" bucket for items with no subtask.
 */
export default function ProjectMaterialsScreen({ projectId }: ProjectMaterialsScreenProps) {
    const { colors } = useTheme();
    const { activeWorkspace } = useWorkspace();

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [subtasks, setSubtasks] = useState<ProjectMaterialSubtask[]>([]);
    const [materialItems, setMaterialItems] = useState<ProjectMaterialItem[]>([]);

    const [addSheetVisible, setAddSheetVisible] = useState(false);
    const [addSheetSubtaskId, setAddSheetSubtaskId] = useState<string | null>(null);
    const [editingItem, setEditingItem] = useState<ProjectMaterialItem | null>(null);
    const [pendingDelete, setPendingDelete] = useState<ProjectMaterialItem | null>(null);
    const [deleting, setDeleting] = useState(false);

    const fetchData = useCallback(async () => {
        if (!activeWorkspace?.id) return;
        const data = await getProjectMaterials(activeWorkspace.id, projectId);
        setSubtasks(data.subtasks);
        setMaterialItems(data.materialItems);
    }, [activeWorkspace?.id, projectId]);

    useEffect(() => {
        setLoading(true);
        fetchData().finally(() => setLoading(false));
    }, [fetchData]);

    const handleRefresh = async () => {
        setRefreshing(true);
        await fetchData();
        setRefreshing(false);
    };

    // Group materials under their subtask, matching the web client's logic:
    // subtasks are shown even with zero materials (so users can see what still
    // needs planning), and items with no matching subtask fall into an
    // "Uncategorized" section.
    const sections: Section[] = subtasks.map((st) => ({
        key: st.id,
        title: st.name,
        subtitle: st.parentTask?.name || "Uncategorized Work",
        subtaskId: st.id,
        materials: materialItems.filter((m) => m.subtaskId === st.id),
    }));

    const subtaskIds = new Set(subtasks.map((s) => s.id));
    const orphaned = materialItems.filter((m) => !m.subtaskId || !subtaskIds.has(m.subtaskId));
    if (orphaned.length > 0) {
        sections.push({
            key: "uncategorized",
            title: "Uncategorized",
            subtaskId: null,
            materials: orphaned,
        });
    }

    const openAddSheet = (subtaskId: string | null) => {
        setEditingItem(null);
        setAddSheetSubtaskId(subtaskId);
        setAddSheetVisible(true);
    };

    const openEditSheet = (item: ProjectMaterialItem) => {
        setEditingItem(item);
        setAddSheetSubtaskId(item.subtaskId);
        setAddSheetVisible(true);
    };

    const handleSubmit = async (payload: ProjectMaterialInput) => {
        if (!activeWorkspace?.id) return;
        if (editingItem) {
            await editProjectMaterial(activeWorkspace.id, projectId, editingItem.id, payload);
        } else {
            await addProjectMaterial(activeWorkspace.id, projectId, payload);
        }
        await fetchData();
    };

    const handleDelete = async () => {
        if (!activeWorkspace?.id || !pendingDelete) return;
        setDeleting(true);
        try {
            await deleteProjectMaterial(activeWorkspace.id, projectId, pendingDelete.id);
            setPendingDelete(null);
            await fetchData();
        } catch {
            // ConfirmationSheet stays open; user can retry.
        } finally {
            setDeleting(false);
        }
    };

    if (loading) {
        return <ListSkeleton rows={5} showAvatar={false} />;
    }

    return (
        <>
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={styles.content}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
            >
                {sections.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Ionicons name="cube-outline" size={40} color={colors.textDim} />
                        <Text style={[styles.emptyTitle, { color: colors.text }]}>No materials planned yet</Text>
                        <Text style={[styles.emptySubtitle, { color: colors.textDim }]}>
                            Tag a subtask "procurement" or add a material below to start planning.
                        </Text>
                        <PressableScale
                            haptic="selection"
                            style={[styles.addBtn, { backgroundColor: colors.primary }]}
                            onPress={() => openAddSheet(null)}
                            accessibilityRole="button"
                            accessibilityLabel="Add material"
                        >
                            <Ionicons name="add" size={18} color="#fff" />
                            <Text style={styles.addBtnText}>Add Material</Text>
                        </PressableScale>
                    </View>
                ) : (
                    <>
                        {sections.map((section) => (
                            <AppCard key={section.key} elevation="sm" style={styles.sectionCard}>
                                <View style={styles.sectionHeader}>
                                    <View style={{ flex: 1, minWidth: 0 }}>
                                        <Text style={[styles.sectionTitle, { color: colors.text }]} numberOfLines={1}>
                                            {section.title}
                                        </Text>
                                        {section.subtitle ? (
                                            <Text style={[styles.sectionSubtitle, { color: colors.textDim }]} numberOfLines={1}>
                                                {section.subtitle}
                                            </Text>
                                        ) : null}
                                    </View>
                                    <PressableScale
                                        haptic="selection"
                                        style={[styles.sectionAddBtn, { backgroundColor: colors.primary + "18" }]}
                                        onPress={() => openAddSheet(section.subtaskId)}
                                        accessibilityRole="button"
                                        accessibilityLabel={`Add material to ${section.title}`}
                                    >
                                        <Ionicons name="add" size={18} color={colors.primary} />
                                    </PressableScale>
                                </View>

                                {section.materials.length === 0 ? (
                                    <Text style={[styles.emptyRowText, { color: colors.textDim }]}>No materials added</Text>
                                ) : (
                                    section.materials.map((m) => (
                                        <PressableScale
                                            key={m.id}
                                            haptic="selection"
                                            style={[styles.materialRow, { borderTopColor: colors.border }]}
                                            onPress={() => openEditSheet(m)}
                                            onLongPress={() => setPendingDelete(m)}
                                            delayLongPress={300}
                                            accessibilityLabel={`${m.materialName}, ${m.quantity} ${m.unit}`}
                                            accessibilityHint="Tap to edit, long-press to delete"
                                        >
                                            <View style={{ flex: 1, minWidth: 0 }}>
                                                <Text style={[styles.materialName, { color: colors.text }]} numberOfLines={1}>
                                                    {m.materialName}
                                                </Text>
                                                {m.notes ? (
                                                    <Text style={[styles.materialNotes, { color: colors.textDim }]} numberOfLines={1}>
                                                        {m.notes}
                                                    </Text>
                                                ) : null}
                                                {m.addedBy?.user ? (
                                                    <Text style={[styles.materialMeta, { color: colors.textDim }]} numberOfLines={1}>
                                                        Added by {m.addedBy.user.surname || m.addedBy.user.name}
                                                    </Text>
                                                ) : null}
                                            </View>
                                            <Text style={[styles.materialQty, { color: colors.primary }]}>
                                                {m.quantity} {m.unit}
                                            </Text>
                                        </PressableScale>
                                    ))
                                )}
                            </AppCard>
                        ))}

                        <PressableScale
                            haptic="selection"
                            style={[styles.addBtn, { backgroundColor: colors.primary, alignSelf: "center", marginTop: SPACING.sm }]}
                            onPress={() => openAddSheet(null)}
                            accessibilityRole="button"
                            accessibilityLabel="Add material"
                        >
                            <Ionicons name="add" size={18} color="#fff" />
                            <Text style={styles.addBtnText}>Add Material</Text>
                        </PressableScale>
                    </>
                )}
            </ScrollView>

            <AddMaterialSheet
                visible={addSheetVisible}
                onClose={() => setAddSheetVisible(false)}
                onSubmit={handleSubmit}
                subtasks={subtasks}
                initialSubtaskId={addSheetSubtaskId}
                editingItem={editingItem}
            />

            <ConfirmationSheet
                visible={!!pendingDelete}
                onClose={() => setPendingDelete(null)}
                onConfirm={handleDelete}
                title="Delete Material"
                description={pendingDelete ? `Remove "${pendingDelete.materialName}" from this plan?` : ""}
                confirmLabel="Delete"
                tone="destructive"
                loading={deleting}
            />
        </>
    );
}

const styles = StyleSheet.create({
    content: {
        padding: SPACING.lg,
        paddingBottom: SPACING.xxl,
    },
    sectionCard: {
        marginBottom: SPACING.md,
        padding: SPACING.md,
    },
    sectionHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 4,
    },
    sectionTitle: {
        fontSize: 15,
        fontFamily: FONTS.bold,
    },
    sectionSubtitle: {
        fontSize: 12,
        fontFamily: FONTS.regular,
        marginTop: 2,
    },
    sectionAddBtn: {
        width: 32,
        height: 32,
        borderRadius: BORDER_RADIUS.sm,
        alignItems: "center",
        justifyContent: "center",
    },
    emptyRowText: {
        fontSize: 13,
        fontFamily: FONTS.regular,
        fontStyle: "italic",
        paddingVertical: SPACING.sm,
    },
    materialRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: SPACING.md,
        paddingVertical: SPACING.sm,
        borderTopWidth: StyleSheet.hairlineWidth,
        marginTop: SPACING.xs,
    },
    materialName: {
        fontSize: 14,
        fontFamily: FONTS.semibold,
    },
    materialNotes: {
        fontSize: 12,
        fontFamily: FONTS.regular,
        marginTop: 2,
    },
    materialMeta: {
        fontSize: 11,
        fontFamily: FONTS.regular,
        marginTop: 2,
    },
    materialQty: {
        fontSize: 13,
        fontFamily: FONTS.bold,
    },
    emptyState: {
        alignItems: "center",
        paddingVertical: SPACING.xxl,
        gap: SPACING.sm,
    },
    emptyTitle: {
        fontSize: 16,
        fontFamily: FONTS.bold,
        marginTop: SPACING.xs,
    },
    emptySubtitle: {
        fontSize: 13,
        fontFamily: FONTS.regular,
        textAlign: "center",
        paddingHorizontal: SPACING.xl,
    },
    addBtn: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: SPACING.lg,
        height: 46,
        borderRadius: BORDER_RADIUS.full,
        marginTop: SPACING.md,
    },
    addBtnText: {
        color: "#fff",
        fontSize: 14,
        fontFamily: FONTS.bold,
    },
});
