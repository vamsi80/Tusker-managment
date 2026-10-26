import type { ComponentType, ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "../../../theme/ThemeProvider";
import { fonts, radius } from "../../../theme/tokens";
import { Text } from "../../../components/ui";

/** A Home card: tinted icon tile, sentence-case title, optional action on the right. */
export function WidgetCard({
    title,
    icon: Icon,
    meta,
    onMetaPress,
    children,
}: {
    title: string;
    icon: ComponentType<{ size?: number; color?: string }>;
    meta?: string;
    onMetaPress?: () => void;
    children: ReactNode;
}) {
    const { colors, shadow } = useTheme();
    return (
        <View style={[styles.card, shadow.sm, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.header}>
                <View style={styles.title}>
                    <View style={[styles.iconTile, { backgroundColor: colors.accent }]}>
                        <Icon size={17} color={colors.primaryInk} />
                    </View>
                    <Text style={{ fontFamily: fonts.heading, fontSize: 16, lineHeight: 22, color: colors.foreground }}>{title}</Text>
                </View>
                {meta ? (
                    <Pressable disabled={!onMetaPress} onPress={onMetaPress} hitSlop={8}>
                        <Text variant="small" tone={onMetaPress ? "primary" : "muted"} style={onMetaPress ? { fontFamily: fonts.semibold } : undefined}>
                            {meta}
                        </Text>
                    </Pressable>
                ) : null}
            </View>
            {children}
        </View>
    );
}

/** Pill-shaped segmented control used inside widgets (Delayed / Today / Week, Upcoming / Previous). */
export function PillSwitch<K extends string>({ items, value, onChange }: { items: { key: K; label: string }[]; value: K; onChange: (k: K) => void }) {
    const { colors, shadow, scheme } = useTheme();
    return (
        <View style={[styles.pills, { backgroundColor: colors.track, borderColor: scheme === "dark" ? colors.border : "transparent" }]}>
            {items.map((item) => {
                const active = item.key === value;
                return (
                    <Pressable key={item.key} onPress={() => onChange(item.key)} style={[styles.pill, active ? [{ backgroundColor: colors.trackActive }, scheme === "light" ? shadow.sm : null] : null]}>
                        <Text style={{ fontFamily: active ? fonts.semibold : fonts.medium, fontSize: 13, color: active ? colors.foreground : colors.mutedForeground }}>
                            {item.label}
                        </Text>
                    </Pressable>
                );
            })}
        </View>
    );
}

export function WidgetRow({ children, onPress }: { children: ReactNode; onPress?: () => void }) {
    const { colors } = useTheme();
    return (
        <Pressable
            onPress={onPress}
            disabled={!onPress}
            style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.secondary : colors.raised }]}
        >
            {children}
        </Pressable>
    );
}

const styles = StyleSheet.create({
    card: { borderRadius: radius.lg, borderWidth: 1, padding: 16, gap: 14 },
    iconTile: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
    title: { flexDirection: "row", alignItems: "center", gap: 10 },
    pills: { flexDirection: "row", padding: 4, borderRadius: radius.md, borderWidth: 1 },
    pill: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 10 },
    row: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12 },
});
