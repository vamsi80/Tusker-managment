import React from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import { SPACING, BORDER_RADIUS } from "../constants/theme";
import { useTheme } from "../context/ThemeContext";
import { Skeleton } from "./Skeleton";

/**
 * Full-screen loading placeholders.
 *
 * These replace full-screen spinners so a screen never paints default or
 * stand-in content (zeroed counts, fallback names) before its data arrives.
 * Pick the variant whose shape matches the screen underneath — structure reads
 * as "nearly there", where a spinner reads as "nothing is happening".
 */

/** A stack of list rows: avatar/icon, title, subtitle. */
export function ListSkeleton({ rows = 6, showAvatar = true }: { rows?: number; showAvatar?: boolean }) {
    const { colors } = useTheme();
    return (
        <View
            style={styles.page}
            accessibilityRole="progressbar"
            accessibilityLabel="Loading"
        >
            {Array.from({ length: rows }).map((_, i) => (
                <View key={i} style={[styles.row, { borderColor: colors.border }]}>
                    {showAvatar && <Skeleton width={38} height={38} radius={19} />}
                    <View style={styles.rowBody}>
                        <Skeleton width={`${55 + ((i * 7) % 30)}%`} height={14} />
                        <Skeleton width={`${30 + ((i * 11) % 25)}%`} height={11} />
                    </View>
                    <Skeleton width={54} height={22} radius={11} />
                </View>
            ))}
        </View>
    );
}

/** Stat tiles above a short list — dashboards and summary screens. */
export function StatsSkeleton({ tiles = 3, rows = 4 }: { tiles?: number; rows?: number }) {
    const { colors } = useTheme();
    return (
        <View style={styles.page} accessibilityRole="progressbar" accessibilityLabel="Loading">
            <View style={styles.tileRow}>
                {Array.from({ length: tiles }).map((_, i) => (
                    <View key={i} style={[styles.tile, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <Skeleton width={26} height={26} radius={8} />
                        <Skeleton width="55%" height={20} style={{ marginTop: 10 }} />
                        <Skeleton width="70%" height={11} style={{ marginTop: 6 }} />
                    </View>
                ))}
            </View>
            <ListSkeleton rows={rows} />
        </View>
    );
}

/** A detail header plus body paragraphs — record/profile screens. */
export function DetailSkeleton({ paragraphs = 3 }: { paragraphs?: number }) {
    const { colors } = useTheme();
    return (
        <ScrollView
            style={styles.page}
            contentContainerStyle={{ paddingBottom: SPACING.xl }}
            scrollEnabled={false}
            accessibilityRole="progressbar"
            accessibilityLabel="Loading"
        >
            <View style={styles.detailHeader}>
                <Skeleton width={64} height={64} radius={32} />
                <View style={{ flex: 1, gap: 8 }}>
                    <Skeleton width="60%" height={18} />
                    <Skeleton width="40%" height={12} />
                </View>
            </View>

            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {Array.from({ length: paragraphs }).map((_, i) => (
                    <View key={i} style={{ gap: 8, marginBottom: SPACING.md }}>
                        <Skeleton width="35%" height={11} />
                        <Skeleton width="100%" height={14} />
                        <Skeleton width="80%" height={14} />
                    </View>
                ))}
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    page: { flex: 1, paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg },
    row: {
        flexDirection: "row",
        alignItems: "center",
        gap: SPACING.md,
        paddingVertical: SPACING.md,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    rowBody: { flex: 1, gap: 7 },
    tileRow: { flexDirection: "row", gap: SPACING.md, marginBottom: SPACING.lg },
    tile: {
        flex: 1,
        borderRadius: BORDER_RADIUS.lg,
        borderWidth: 1,
        padding: SPACING.md,
    },
    detailHeader: {
        flexDirection: "row",
        alignItems: "center",
        gap: SPACING.md,
        marginBottom: SPACING.lg,
    },
    card: {
        borderRadius: BORDER_RADIUS.lg,
        borderWidth: 1,
        padding: SPACING.lg,
    },
});

export default ListSkeleton;
