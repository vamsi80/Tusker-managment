import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { formatDistanceToNow } from "date-fns";
import { SPACING, FONTS } from "../constants/theme";
import { useTheme } from "../context/ThemeContext";
import { getPendingReviews } from "../services/api";
import { getUserDisplayName, getUserDisplayInitial } from "../utils/userDisplayName";
import PressableScale from "./PressableScale";
import { Skeleton } from "./Skeleton";

interface ReviewItem {
    id: string;
    name: string;
    taskSlug: string;
    dueDate: string | null;
    updatedAt: string;
    isParent: boolean;
    parentTask: { id: string; name: string; taskSlug: string } | null;
    project: { id: string; name: string; color: string } | null;
    assignee: {
        workspaceMember: {
            user: { id: string; name: string; surname?: string | null; image?: string | null };
        } | null;
    } | null;
}

/**
 * "My Reviews" — subtasks/tasks the current user is named reviewer on that
 * the assignee has pushed to REVIEW status. Hidden entirely when empty, same
 * convention as the Birthdays widget: an empty review queue isn't worth a
 * permanent slot on the home screen.
 */
export default function ReviewsWidget({
    workspaceId,
    onOpenTask,
}: {
    workspaceId: string;
    onOpenTask: (task: { id: string; name: string }) => void;
}) {
    const { colors } = useTheme();
    const [reviews, setReviews] = useState<ReviewItem[] | null>(null);

    const load = useCallback(async () => {
        const data = await getPendingReviews(workspaceId);
        setReviews(data);
    }, [workspaceId]);

    useEffect(() => {
        if (workspaceId) load();
    }, [workspaceId, load]);

    if (reviews === null) {
        return (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Skeleton width={140} height={12} />
                <View style={{ height: SPACING.md }} />
                <Skeleton width="75%" height={14} />
            </View>
        );
    }

    if (reviews.length === 0) return null;

    return (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.header}>
                <View style={styles.headerIcon}>
                    <Ionicons name="checkmark-done-outline" size={20} color={colors.text} />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={[styles.headerTitle, { color: colors.text }]}>My Reviews</Text>
                    <Text style={[styles.headerSubtitle, { color: colors.textDim }]}>
                        {reviews.length} awaiting your review
                    </Text>
                </View>
            </View>

            {reviews.map((item) => {
                const assigneeUser = item.assignee?.workspaceMember?.user;
                const parentLabel = item.parentTask?.name;
                return (
                    <PressableScale
                        key={item.id}
                        haptic="selection"
                        style={[styles.row, { borderTopColor: colors.border }]}
                        onPress={() => onOpenTask({ id: item.id, name: item.name })}
                        accessibilityLabel={`Review ${item.name}`}
                    >
                        <View style={styles.rowHeader}>
                            <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={1}>
                                {item.name}
                            </Text>
                            <Text style={[styles.rowDate, { color: colors.textDim }]}>
                                {formatDistanceToNow(new Date(item.updatedAt), { addSuffix: true })}
                            </Text>
                        </View>
                        <Text style={[styles.rowMeta, { color: colors.textMuted }]} numberOfLines={1}>
                            {[item.project?.name, parentLabel ? `Subtask of "${parentLabel}"` : null]
                                .filter(Boolean)
                                .join(" · ")}
                        </Text>
                        <View style={styles.rowFooterRow}>
                            <View style={styles.assigneeRow}>
                                <View style={[styles.assigneeAvatar, { backgroundColor: colors.primary + "24" }]}>
                                    {assigneeUser?.image ? (
                                        <Image source={{ uri: assigneeUser.image }} style={styles.assigneeAvatarImg} />
                                    ) : (
                                        <Text style={{ fontSize: 10, fontFamily: FONTS.bold, color: colors.primary }}>
                                            {getUserDisplayInitial(assigneeUser)}
                                        </Text>
                                    )}
                                </View>
                                <Text style={[styles.rowFooter, { color: colors.textDim }]} numberOfLines={1}>
                                    Pushed by {getUserDisplayName(assigneeUser, "someone")}
                                </Text>
                            </View>
                            <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
                        </View>
                    </PressableScale>
                );
            })}
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

    row: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: SPACING.sm, marginTop: SPACING.sm },
    rowHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
    rowTitle: { fontSize: 14, fontFamily: FONTS.bold, flex: 1 },
    rowDate: { fontSize: 10, fontFamily: FONTS.semibold },
    rowMeta: { fontSize: 12, marginTop: 2 },
    rowFooterRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6, gap: 8 },
    assigneeRow: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1 },
    assigneeAvatar: { width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", overflow: "hidden" },
    assigneeAvatarImg: { width: "100%", height: "100%" },
    rowFooter: { fontSize: 10, flex: 1 },
});
