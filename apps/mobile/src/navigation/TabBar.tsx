import { useEffect, useRef, useState, type ComponentType } from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Folder, House, Inbox, LayoutGrid, Plus } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useWorkspace } from "../providers/WorkspaceProvider";
import { useTheme } from "../theme/ThemeProvider";
import { fonts } from "../theme/tokens";
import { Text } from "../components/ui";
import { CreateSheet } from "../components/layout/CreateSheet";

type IconType = ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
type TabMeta = { label: string; icon: IconType };

/** Home and Projects on the left, Inbox and More on the right, Create in the middle. */
const META: Record<string, TabMeta> = {
    Home: { label: "Home", icon: House },
    Projects: { label: "Projects", icon: Folder },
    Inbox: { label: "Inbox", icon: Inbox },
    More: { label: "More", icon: LayoutGrid },
};

/** Past tablet width the bar stops stretching and centres. */
const MAX_WIDTH = 480;

/**
 * drava tab bar: a floating surface with every tab labelled. The active tab
 * turns lime (a lime pill in light mode); the Create button wears the logo's
 * "smile corner".
 */
export function TabBar({ state, navigation }: BottomTabBarProps) {
    const { colors, scheme } = useTheme();
    const insets = useSafeAreaInsets();
    const { layout } = useWorkspace();
    const [createOpen, setCreateOpen] = useState(false);
    const unread = layout?.unreadNotificationsCount ?? 0;

    const tab = (index: number) => {
        const route = state.routes[index];
        const meta = META[route.name];
        if (!meta) return null;
        const focused = state.index === index;
        return (
            <TabButton
                key={route.key}
                meta={meta}
                focused={focused}
                badge={route.name === "Inbox" ? unread : 0}
                onPress={() => {
                    const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                    if (!focused && !event.defaultPrevented) {
                        Haptics.selectionAsync().catch(() => {});
                        navigation.navigate(route.name, route.params);
                    }
                }}
            />
        );
    };
    const left = state.routes.map((r, i) => (r.name === "Home" || r.name === "Projects" ? i : -1)).filter((i) => i >= 0);
    const right = state.routes.map((r, i) => (r.name === "Inbox" || r.name === "More" ? i : -1)).filter((i) => i >= 0);

    return (
        <>
            <View style={{ backgroundColor: colors.background, paddingHorizontal: 16, paddingTop: 6, paddingBottom: Math.max(insets.bottom, 10) }}>
                <View
                    style={[
                        styles.bar,
                        { maxWidth: MAX_WIDTH, alignSelf: "center", width: "100%", backgroundColor: colors.tabBar, borderColor: colors.border },
                        scheme === "light" ? styles.barShadow : null,
                    ]}
                    accessibilityRole="tablist"
                >
                    <View style={styles.group}>{left.map(tab)}</View>
                    <View style={styles.fabSlot}>
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Create"
                            accessibilityHint="Opens the create menu"
                            onPress={() => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                                setCreateOpen(true);
                            }}
                            style={({ pressed }) => [styles.fab, { backgroundColor: colors.createBg, transform: [{ scale: pressed ? 0.92 : 1 }] }]}
                        >
                            <Plus size={26} color={colors.createFg} strokeWidth={2.4} />
                        </Pressable>
                    </View>
                    <View style={styles.group}>{right.map(tab)}</View>
                </View>
            </View>
            <CreateSheet open={createOpen} onClose={() => setCreateOpen(false)} />
        </>
    );
}

function TabButton({ meta, focused, badge, onPress }: { meta: TabMeta; focused: boolean; badge: number; onPress: () => void }) {
    const { colors, scheme } = useTheme();
    const scale = useRef(new Animated.Value(focused ? 1 : 0.94)).current;
    useEffect(() => {
        Animated.spring(scale, { toValue: focused ? 1 : 0.94, useNativeDriver: true, damping: 18, stiffness: 220, mass: 0.9 }).start();
    }, [focused, scale]);
    const Icon = meta.icon;
    const light = scheme === "light";
    // Dark: lime glyph. Light: dark glyph on a lime pill (lime alone is too faint on white).
    const iconColor = focused ? (light ? colors.primaryForeground : colors.primary) : colors.mutedForeground;

    return (
        <Pressable accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={meta.label} onPress={onPress} style={({ pressed }) => [styles.tab, { opacity: pressed ? 0.7 : 1 }]}>
            <Animated.View style={[styles.inner, { transform: [{ scale }] }]}>
                <View style={[styles.iconWrap, focused && light ? { backgroundColor: colors.primary } : null]}>
                    <Icon size={22} color={iconColor} strokeWidth={focused ? 2.2 : 1.8} />
                    {badge > 0 ? (
                        <View style={[styles.badge, { backgroundColor: colors.badgeBg, borderColor: colors.tabBar }]}>
                            <Text style={{ fontFamily: fonts.bold, fontSize: 10, lineHeight: 12, includeFontPadding: false, textAlignVertical: "center", color: colors.badgeFg }}>{badge > 99 ? "99+" : badge}</Text>
                        </View>
                    ) : null}
                </View>
                <Text
                    style={{ fontFamily: focused ? fonts.semibold : fonts.medium, fontSize: 11, color: focused ? colors.foreground : colors.mutedForeground }}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                    maxFontSizeMultiplier={1.15}
                >
                    {meta.label}
                </Text>
            </Animated.View>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    bar: { flexDirection: "row", alignItems: "center", height: 66, borderRadius: 22, borderWidth: 1, paddingHorizontal: 4 },
    barShadow: { shadowColor: "#17181A", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.08, shadowRadius: 20, elevation: 6 },
    group: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-around", height: "100%" },
    tab: { flex: 1, alignItems: "center", justifyContent: "center", height: "100%" },
    inner: { alignItems: "center", justifyContent: "center", gap: 3, minHeight: 48 },
    iconWrap: { width: 46, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
    fabSlot: { width: 70, alignItems: "center", justifyContent: "center" },
    // The smile corner: one larger bottom-right radius, echoing the drava symbol.
    fab: { width: 54, height: 54, borderTopLeftRadius: 16, borderTopRightRadius: 16, borderBottomLeftRadius: 16, borderBottomRightRadius: 30, alignItems: "center", justifyContent: "center" },
    badge: { position: "absolute", top: -6, right: 0, minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 4, borderWidth: 2, alignItems: "center", justifyContent: "center" },
});
