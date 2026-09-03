import React, { useMemo } from "react";
import { View, Text, StyleSheet, Image } from "react-native";
import { FONTS } from "../constants/theme";
import OptionPickerSheet, { PickerOption } from "./OptionPickerSheet";

/** Surname-style display name, matching how the rest of the app labels people. */
export function memberDisplayName(member: any): string {
    const raw =
        member?.user?.surname ||
        member?.surname ||
        member?.user?.name ||
        member?.name ||
        "";
    const trimmed = String(raw).trim();
    if (!trimmed) return "Unknown";
    const parts = trimmed.split(/\s+/);
    return parts[parts.length - 1];
}

const AVATAR_COLORS = ["#ef4444", "#8b5cf6", "#3b82f6", "#10b981", "#f59e0b"];

export function memberAvatarColor(member: any): string {
    const seed = member?.userId ? member.userId.charCodeAt(0) % AVATAR_COLORS.length : 0;
    return AVATAR_COLORS[seed];
}

export function memberPhoto(member: any): string | null {
    return member?.image || member?.user?.image || null;
}

interface MemberPickerSheetProps {
    visible: boolean;
    onClose: () => void;
    title: string;
    members: any[];
    selectedId?: string | null;
    onSelect?: (userId: string | null) => void;
    /** Shown when there are no eligible members. */
    emptyText?: string;
    /** Label for the "no one selected" row. */
    clearLabel?: string;

    /** Multi-select mode (used by the filter sheet). */
    multiple?: boolean;
    selectedIds?: string[];
    onToggle?: (userId: string) => void;
    onClearAll?: () => void;
}

/**
 * Member variant of {@link OptionPickerSheet} — adds the avatar and the
 * surname-style label, and lets the search box match on email too.
 */
export default function MemberPickerSheet({
    visible,
    onClose,
    title,
    members,
    selectedId,
    onSelect,
    emptyText = "No members available",
    clearLabel = "Unassigned",
    multiple,
    selectedIds,
    onToggle,
    onClearAll,
}: MemberPickerSheetProps) {
    const options = useMemo<PickerOption[]>(
        () =>
            members.map((m) => {
                const name = memberDisplayName(m);
                const photo = memberPhoto(m);
                return {
                    id: m.userId,
                    label: name,
                    searchText: String(m?.email || m?.user?.email || ""),
                    leading: photo ? (
                        <Image source={{ uri: photo }} style={styles.avatar} />
                    ) : (
                        <View style={[styles.avatar, { backgroundColor: memberAvatarColor(m) }]}>
                            <Text style={styles.avatarText}>{name.charAt(0).toUpperCase()}</Text>
                        </View>
                    ),
                };
            }),
        [members]
    );

    return (
        <OptionPickerSheet
            visible={visible}
            onClose={onClose}
            title={title}
            options={options}
            selectedId={selectedId}
            onSelect={onSelect}
            emptyText={emptyText}
            clearLabel={clearLabel}
            multiple={multiple}
            selectedIds={selectedIds}
            onToggle={onToggle}
            onClearAll={onClearAll}
        />
    );
}

const styles = StyleSheet.create({
    avatar: {
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: "center",
        alignItems: "center",
    },
    avatarText: { color: "#fff", fontSize: 14, fontFamily: FONTS.bold },
});
