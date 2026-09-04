import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, TextInput, ActivityIndicator, ScrollView, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SPACING, BORDER_RADIUS, FONTS } from "../constants/theme";
import { useTheme } from "../context/ThemeContext";
import Sheet from "./Sheet";
import PressableScale from "./PressableScale";
import OptionPickerSheet, { PickerOption } from "./OptionPickerSheet";
import { haptics } from "../services/haptics";
import { ProjectMaterialInput, ProjectMaterialItem, ProjectMaterialSubtask } from "../services/api";

interface AddMaterialSheetProps {
    visible: boolean;
    onClose: () => void;
    onSubmit: (payload: ProjectMaterialInput) => Promise<void>;
    subtasks: ProjectMaterialSubtask[];
    /** Preselect a subtask, e.g. when adding from within a subtask section. */
    initialSubtaskId?: string | null;
    editingItem?: ProjectMaterialItem | null;
}

/**
 * Add/edit a planning material item. Mirrors the web project Materials tab's
 * create dialog (apps/web .../materials/_components/create-material-dialog.tsx).
 */
export default function AddMaterialSheet({
    visible,
    onClose,
    onSubmit,
    subtasks,
    initialSubtaskId,
    editingItem,
}: AddMaterialSheetProps) {
    const { colors } = useTheme();
    const isEditing = !!editingItem;

    const [subtaskId, setSubtaskId] = useState<string | null>(null);
    const [subtaskPickerOpen, setSubtaskPickerOpen] = useState(false);
    const [materialName, setMaterialName] = useState("");
    const [unit, setUnit] = useState("");
    const [quantity, setQuantity] = useState("");
    const [notes, setNotes] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!visible) return;
        if (editingItem) {
            setSubtaskId(editingItem.subtaskId ?? null);
            setMaterialName(editingItem.materialName);
            setUnit(editingItem.unit);
            setQuantity(String(editingItem.quantity));
            setNotes(editingItem.notes || "");
        } else {
            setSubtaskId(initialSubtaskId ?? null);
            setMaterialName("");
            setUnit("");
            setQuantity("");
            setNotes("");
        }
        setError(null);
    }, [visible, editingItem, initialSubtaskId]);

    const subtaskOptions: PickerOption[] = useMemo(
        () =>
            subtasks.map((st) => ({
                id: st.id,
                label: st.name,
                searchText: st.parentTask?.name || "",
            })),
        [subtasks]
    );
    const selectedSubtask = subtasks.find((st) => st.id === subtaskId) || null;

    const handleSubmit = async () => {
        if (loading) return;
        const trimmedName = materialName.trim();
        const trimmedUnit = unit.trim();
        const qty = parseFloat(quantity);

        if (!trimmedName) {
            setError("Material name is required.");
            return;
        }
        if (!trimmedUnit) {
            setError("Unit is required.");
            return;
        }
        if (!quantity || isNaN(qty) || qty <= 0) {
            setError("Enter a quantity greater than zero.");
            return;
        }

        setLoading(true);
        setError(null);
        try {
            await onSubmit({
                subtaskId,
                materialName: trimmedName,
                unit: trimmedUnit,
                quantity: qty,
                notes: notes.trim() || null,
            });
            haptics.success();
            onClose();
        } catch (err: any) {
            setError(err.message || "Something went wrong.");
            haptics.error();
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <Sheet visible={visible} onClose={onClose} accessibilityLabel={isEditing ? "Edit material" : "Add material"}>
                <View style={styles.header}>
                    <Text style={[styles.title, { color: colors.text }]}>
                        {isEditing ? "Edit Material" : "Add Material"}
                    </Text>
                </View>

                <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
                    <Text style={[styles.label, { color: colors.textDim }]}>Subtask</Text>
                    <TouchableOpacity
                        style={[styles.selectTrigger, { backgroundColor: colors.background, borderColor: colors.border }]}
                        onPress={() => setSubtaskPickerOpen(true)}
                        accessibilityRole="button"
                        accessibilityLabel={"Subtask: " + (selectedSubtask?.name || "none selected")}
                    >
                        <Text
                            style={[styles.selectValue, { color: selectedSubtask ? colors.text : colors.textDim }]}
                            numberOfLines={1}
                        >
                            {selectedSubtask ? selectedSubtask.name : "No subtask"}
                        </Text>
                        <Ionicons name="chevron-down" size={18} color={colors.textDim} />
                    </TouchableOpacity>

                    <Text style={[styles.label, { color: colors.textDim }]}>Material Name *</Text>
                    <TextInput
                        style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                        placeholder="e.g. Cement"
                        placeholderTextColor={colors.textDim}
                        value={materialName}
                        onChangeText={setMaterialName}
                        autoFocus={!isEditing}
                    />

                    <View style={styles.row}>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.label, { color: colors.textDim }]}>Quantity *</Text>
                            <TextInput
                                style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                                placeholder="100"
                                placeholderTextColor={colors.textDim}
                                value={quantity}
                                onChangeText={setQuantity}
                                keyboardType="numeric"
                            />
                        </View>
                        <View style={{ width: SPACING.md }} />
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.label, { color: colors.textDim }]}>Unit *</Text>
                            <TextInput
                                style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                                placeholder="bags, kg, CFT..."
                                placeholderTextColor={colors.textDim}
                                value={unit}
                                onChangeText={setUnit}
                            />
                        </View>
                    </View>

                    <Text style={[styles.label, { color: colors.textDim }]}>Notes (Optional)</Text>
                    <TextInput
                        style={[styles.input, styles.notesInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                        placeholder="Specifications, brand, etc."
                        placeholderTextColor={colors.textDim}
                        value={notes}
                        onChangeText={setNotes}
                        multiline
                        textAlignVertical="top"
                    />

                    {error && <Text style={styles.errorText}>{error}</Text>}
                </ScrollView>

                <View style={[styles.footer, { borderTopColor: colors.border }]}>
                    <PressableScale
                        haptic={null}
                        style={[styles.submitBtn, { backgroundColor: colors.primary }, loading && styles.submitBtnDisabled]}
                        onPress={handleSubmit}
                        disabled={loading}
                        accessibilityRole="button"
                        accessibilityLabel={isEditing ? "Save changes" : "Add material"}
                        accessibilityState={{ disabled: loading, busy: loading }}
                    >
                        {loading ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text style={styles.submitBtnText}>{isEditing ? "Save Changes" : "Add Material"}</Text>
                        )}
                    </PressableScale>
                </View>
            </Sheet>

            <OptionPickerSheet
                visible={subtaskPickerOpen}
                onClose={() => setSubtaskPickerOpen(false)}
                title="Select Subtask"
                options={subtaskOptions}
                selectedId={subtaskId}
                onSelect={(id) => setSubtaskId(id)}
                emptyText="No procurement subtasks in this project"
                clearLabel="No subtask"
            />
        </>
    );
}

const styles = StyleSheet.create({
    header: {
        alignItems: "center",
        paddingTop: 4,
        paddingBottom: 8,
    },
    title: {
        fontSize: 18,
        fontFamily: FONTS.bold,
    },
    content: {
        paddingHorizontal: SPACING.lg,
    },
    label: {
        fontSize: 12,
        fontFamily: FONTS.bold,
        marginBottom: 8,
        marginTop: 16,
        textTransform: "uppercase",
        letterSpacing: 0.7,
    },
    input: {
        borderRadius: BORDER_RADIUS.md,
        padding: SPACING.md,
        fontSize: 16,
        borderWidth: 1,
    },
    notesInput: {
        minHeight: 80,
    },
    row: {
        flexDirection: "row",
    },
    selectTrigger: {
        flexDirection: "row",
        alignItems: "center",
        gap: SPACING.sm,
        minHeight: 48,
        paddingHorizontal: SPACING.md,
        borderRadius: BORDER_RADIUS.md,
        borderWidth: 1,
    },
    selectValue: {
        flex: 1,
        fontSize: 16,
        fontFamily: FONTS.medium,
    },
    footer: {
        padding: SPACING.lg,
        borderTopWidth: 1,
    },
    submitBtn: {
        borderRadius: BORDER_RADIUS.md,
        height: 52,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
    },
    submitBtnDisabled: {
        opacity: 0.5,
    },
    submitBtnText: {
        color: "#fff",
        fontSize: 16,
        fontFamily: FONTS.bold,
    },
    errorText: {
        color: "#ef4444",
        fontSize: 12,
        marginTop: 12,
        textAlign: "center",
    },
});
