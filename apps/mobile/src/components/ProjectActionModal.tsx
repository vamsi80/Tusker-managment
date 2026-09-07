import React from "react";
import {
    View,
    Text,
    StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SPACING, BORDER_RADIUS, FONTS } from "../constants/theme";
import { useTheme } from "../context/ThemeContext";
import Sheet from "./Sheet";
import PressableScale from "./PressableScale";

interface ProjectActionModalProps {
    visible: boolean;
    onClose: () => void;
    projectName: string;
    onView: () => void;
    onEdit: () => void;
    onManageMembers: () => void;
    onDelete: () => void;
    canManage?: boolean;
}

export default function ProjectActionModal({
    visible,
    onClose,
    projectName,
    onView,
    onEdit,
    onManageMembers,
    onDelete,
    canManage = false
}: ProjectActionModalProps) {
    const { colors } = useTheme();

    const ActionItem = ({
        icon,
        label,
        onPress,
        destructive = false
    }: {
        icon: keyof typeof Ionicons.glyphMap;
        label: string;
        onPress: () => void;
        destructive?: boolean;
    }) => (
        <PressableScale
            haptic={destructive ? "warning" : "selection"}
            style={styles.actionItem}
            onPress={() => {
                onPress();
                onClose();
            }}
            accessibilityRole="button"
            accessibilityLabel={label}
        >
            <View style={[styles.iconBox, { backgroundColor: destructive ? `${colors.error}18` : colors.surfaceHighlight }]}>
                <Ionicons
                    name={icon}
                    size={20}
                    color={destructive ? colors.error : colors.primary}
                />
            </View>
            <Text style={[styles.actionLabel, { color: destructive ? colors.error : colors.text }]}>
                {label}
            </Text>
        </PressableScale>
    );

    return (
        <Sheet visible={visible} onClose={onClose} accessibilityLabel="Project actions">
            {/* Header matches the app's other sheets (StatusPickerModal,
                ConfirmationSheet): one centred 18/bold title, with the subject
                as a 14/regular dimmed subtitle beneath it. */}
            <View style={styles.header}>
                <Text style={[styles.title, { color: colors.text }]}>Project Actions</Text>
                <Text style={[styles.subtitle, { color: colors.textDim }]} numberOfLines={1}>
                    {projectName}
                </Text>
            </View>

            <View style={styles.content}>
                <ActionItem icon="eye-outline" label="View Project" onPress={onView} />
                {canManage && (
                    <>
                        <ActionItem icon="pencil-outline" label="Edit Project" onPress={onEdit} />
                        <ActionItem icon="people-outline" label="Manage Members" onPress={onManageMembers} />
                        <View style={[styles.separator, { backgroundColor: colors.border }]} />
                        <ActionItem icon="trash-outline" label="Delete Project" onPress={onDelete} destructive />
                    </>
                )}
            </View>
        </Sheet>
    );
}

const styles = StyleSheet.create({
    header: {
        paddingHorizontal: SPACING.md,
        paddingBottom: 12,
        alignItems: "center",
    },
    title: {
        fontSize: 18,
        fontFamily: FONTS.bold,
    },
    subtitle: {
        fontSize: 14,
        fontFamily: FONTS.regular,
        lineHeight: 20,
        marginTop: 2,
    },
    content: {
        paddingHorizontal: SPACING.md,
        paddingTop: 4,
    },
    // Inset rounded rows, matching StatusPickerModal's list items.
    actionItem: {
        flexDirection: "row",
        alignItems: "center",
        padding: SPACING.md,
        borderRadius: BORDER_RADIUS.lg,
        marginBottom: 4,
    },
    iconBox: {
        width: 36,
        height: 36,
        borderRadius: 10,
        justifyContent: "center",
        alignItems: "center",
        marginRight: SPACING.md,
    },
    actionLabel: {
        flex: 1,
        fontSize: 16,
        fontFamily: FONTS.medium,
    },
    separator: {
        height: StyleSheet.hairlineWidth,
        marginVertical: SPACING.xs,
        marginHorizontal: SPACING.md,
    },
});
