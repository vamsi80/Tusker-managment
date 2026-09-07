import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, TextInput, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SPACING, BORDER_RADIUS, FONTS } from "../constants/theme";
import { useTheme } from "../context/ThemeContext";
import Sheet from "./Sheet";
import PressableScale from "./PressableScale";
import { haptics } from "../services/haptics";

export interface PickerOption {
    id: string;
    label: string;
    /** Extra text matched by the search box but not displayed. */
    searchText?: string;
    /** Leading visual (avatar, coloured dot, icon). */
    leading?: React.ReactNode;
    /** Highlight colour for the selected label; falls back to the theme primary. */
    accent?: string;
}

interface OptionPickerSheetProps {
    visible: boolean;
    onClose: () => void;
    title: string;
    options: PickerOption[];
    emptyText?: string;
    /** Label for the "nothing selected" row; pass null to hide that row. */
    clearLabel?: string | null;
    /** Show the search box once there are more than this many options. */
    searchThreshold?: number;

    /** Single-select (default): picking an option closes the sheet. */
    selectedId?: string | null;
    onSelect?: (id: string | null) => void;

    /**
     * Multi-select: the sheet stays open and each row toggles. Used by the
     * filter sheet, where several assignees or tags can be active at once.
     */
    multiple?: boolean;
    selectedIds?: string[];
    onToggle?: (id: string) => void;
    /** Multi-select only: clears every selection. */
    onClearAll?: () => void;
}

/**
 * Single-select bottom-sheet list.
 *
 * The shared implementation behind the assignee, reviewer and tag pickers —
 * these were horizontally scrolling chip strips, which hid most options
 * off-screen behind a sideways swipe and offered no search.
 */
export default function OptionPickerSheet({
    visible,
    onClose,
    title,
    options,
    selectedId = null,
    onSelect,
    emptyText = "Nothing available",
    clearLabel = "None",
    searchThreshold = 6,
    multiple = false,
    selectedIds,
    onToggle,
    onClearAll,
}: OptionPickerSheetProps) {
    const { colors, isDark } = useTheme();
    const [query, setQuery] = useState("");

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return options;
        return options.filter(
            (o) =>
                o.label.toLowerCase().includes(q) ||
                (o.searchText ?? "").toLowerCase().includes(q)
        );
    }, [options, query]);

    const activeIds = selectedIds ?? [];
    const isChosen = (id: string) => (multiple ? activeIds.includes(id) : selectedId === id);

    const choose = (id: string | null) => {
        haptics.selection();
        if (multiple) {
            // Stay open so several values can be toggled in one visit.
            if (id === null) onClearAll?.();
            else onToggle?.(id);
            return;
        }
        onSelect?.(id);
        onClose();
    };

    const selectedBg = isDark ? colors.activeTab : "#e0e7ff";

    return (
        <Sheet visible={visible} onClose={onClose} accessibilityLabel={title}>
            <View style={styles.headerRow}>
                <View style={{ width: 40 }} />
                <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
                <View style={{ width: 40 }} />
            </View>

            {options.length > searchThreshold && (
                <View style={[styles.searchBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <Ionicons name="search" size={16} color={colors.textDim} />
                    <TextInput
                        value={query}
                        onChangeText={setQuery}
                        placeholder="Search"
                        placeholderTextColor={colors.textDim}
                        style={[styles.searchInput, { color: colors.text }]}
                        autoCorrect={false}
                        accessibilityLabel={`Search ${title.toLowerCase()}`}
                    />
                </View>
            )}

            <ScrollView
                style={styles.list}
                contentContainerStyle={styles.listContent}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
                showsVerticalScrollIndicator
                bounces={false}
            >
                {clearLabel !== null && (
                    <PressableScale
                        haptic={null}
                        style={[styles.row, (multiple ? activeIds.length === 0 : selectedId === null) && { backgroundColor: selectedBg }]}
                        onPress={() => choose(null)}
                        accessibilityRole={multiple ? "button" : "radio"}
                        accessibilityState={{ selected: multiple ? activeIds.length === 0 : selectedId === null }}
                        accessibilityLabel={clearLabel}
                    >
                        <View style={[styles.leadingSlot, { backgroundColor: colors.border }]}>
                            <Ionicons name="close" size={15} color={colors.textDim} />
                        </View>
                        <Text style={[styles.label, { color: colors.textDim }]}>{clearLabel}</Text>
                        {(multiple ? activeIds.length === 0 : selectedId === null) && (
                            <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                        )}
                    </PressableScale>
                )}

                {filtered.length === 0 ? (
                    <Text style={[styles.empty, { color: colors.textDim }]}>
                        {query ? "No matches" : emptyText}
                    </Text>
                ) : (
                    filtered.map((o) => {
                        const isSelected = isChosen(o.id);
                        const accent = o.accent || colors.primary;
                        return (
                            <PressableScale
                                key={o.id}
                                haptic={null}
                                style={[styles.row, isSelected && { backgroundColor: selectedBg }]}
                                onPress={() => choose(multiple ? o.id : (isSelected ? null : o.id))}
                                accessibilityRole={multiple ? "checkbox" : "radio"}
                                accessibilityState={{ selected: isSelected }}
                                accessibilityLabel={o.label}
                            >
                                {o.leading ?? <View style={styles.leadingSlot} />}
                                <Text
                                    style={[
                                        styles.label,
                                        { color: colors.text },
                                        isSelected && { color: accent, fontFamily: FONTS.bold },
                                    ]}
                                    numberOfLines={1}
                                >
                                    {o.label}
                                </Text>
                                {isSelected && (
                                    <Ionicons
                                        name={multiple ? "checkbox" : "checkmark-circle"}
                                        size={20}
                                        color={accent}
                                    />
                                )}
                            </PressableScale>
                        );
                    })
                )}
            </ScrollView>
        </Sheet>
    );
}

export const pickerStyles = StyleSheet.create({
    leadingSlot: {
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: "center",
        alignItems: "center",
    },
});

const styles = StyleSheet.create({
    headerRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        paddingHorizontal: SPACING.md,
        paddingBottom: 12,
    },
    title: { fontSize: 18, fontFamily: FONTS.bold },
    searchBox: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginHorizontal: SPACING.md,
        paddingHorizontal: SPACING.md,
        height: 40,
        borderRadius: BORDER_RADIUS.md,
        borderWidth: 1,
    },
    searchInput: { flex: 1, fontSize: 14, fontFamily: FONTS.regular, padding: 0 },
    list: { maxHeight: 340 },
    listContent: { paddingHorizontal: SPACING.md, paddingTop: 4 },
    row: {
        flexDirection: "row",
        alignItems: "center",
        padding: SPACING.md,
        borderRadius: BORDER_RADIUS.lg,
        marginBottom: 4,
        gap: SPACING.md,
    },
    leadingSlot: {
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: "center",
        alignItems: "center",
    },
    label: { flex: 1, fontSize: 16, fontFamily: FONTS.medium },
    empty: {
        fontSize: 13,
        fontFamily: FONTS.regular,
        fontStyle: "italic",
        paddingVertical: SPACING.lg,
        textAlign: "center",
    },
});
