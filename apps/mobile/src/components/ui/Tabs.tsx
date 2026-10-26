import type { ComponentType } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "../../theme/ThemeProvider";
import { fonts, radius } from "../../theme/tokens";
import { Text } from "./Text";

export type TabItem<K extends string> = {
    key: K;
    label: string;
    icon?: ComponentType<{ size?: number; color?: string }>;
    count?: number;
};

/**
 * The web's section nav (team-nav, settings-nav, procurement-tabs, project
 * view switcher): a pill row in a muted track, scrollable when it overflows.
 */
export function Tabs<K extends string>({
    items,
    value,
    onChange,
    scrollable = true,
    compact,
}: {
    items: TabItem<K>[];
    value: K;
    onChange: (key: K) => void;
    scrollable?: boolean;
    compact?: boolean;
}) {
    const { colors, shadow, scheme } = useTheme();
    // drava segmented control: charcoal pill on a surface track (dark), white pill on Frost (light).
    const activeBg = colors.trackActive;
    const content = items.map((item) => {
        const active = item.key === value;
        const Icon = item.icon;
        return (
            <Pressable
                key={item.key}
                onPress={() => {
                    if (!active) Haptics.selectionAsync().catch(() => {});
                    onChange(item.key);
                }}
                style={[
                    styles.tab,
                    { paddingVertical: compact ? 7 : 9, flex: scrollable ? undefined : 1 },
                    active ? [{ backgroundColor: activeBg }, scheme === "light" ? shadow.sm : null] : null,
                ]}
            >
                {Icon ? <Icon size={15} color={active ? colors.foreground : colors.mutedForeground} /> : null}
                <Text style={{ fontFamily: active ? fonts.semibold : fonts.medium, fontSize: 13, color: active ? colors.foreground : colors.mutedForeground }}>
                    {item.label}
                </Text>
                {item.count ? (
                    <View style={[styles.count, { backgroundColor: active ? colors.primary : colors.raised }]}>
                        <Text style={{ fontFamily: fonts.bold, fontSize: 10, color: active ? colors.primaryForeground : colors.mutedForeground }}>{item.count}</Text>
                    </View>
                ) : null}
            </Pressable>
        );
    });

    return (
        <View style={[styles.track, { backgroundColor: colors.track, borderColor: scheme === "dark" ? colors.border : "transparent" }]}>
            {scrollable ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
                    {content}
                </ScrollView>
            ) : (
                <View style={{ flexDirection: "row", gap: 4 }}>{content}</View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    track: { padding: 4, borderRadius: radius.md, borderWidth: 1 },
    tab: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 14, borderRadius: 10 },
    count: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, alignItems: "center", justifyContent: "center" },
});
