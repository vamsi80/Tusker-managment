import type { ComponentType, ReactNode } from "react";
import { KeyboardAvoidingView, Pressable, RefreshControl, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { ChevronLeft, Sparkles } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "../../theme/ThemeProvider";
import { fonts } from "../../theme/tokens";
import { Text } from "../ui/Text";

/**
 * App header. A tab's root screen gets a large Archivo Expanded title; a
 * pushed screen gets a compact bar with a squared back button (drava style).
 * `back` defaults to "not a tab root", so stack screens need no prop.
 */
export function ScreenHeader({
    title,
    subtitle,
    back,
    right,
    showActions = true,
    large,
}: {
    title: string;
    subtitle?: string;
    back?: boolean;
    right?: ReactNode;
    showActions?: boolean;
    large?: boolean;
}) {
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();
    const navigation = useNavigation<any>();
    const isTabRoot = navigation.getState?.()?.type === "tab";
    const showBack = back ?? !isTabRoot;
    const big = large ?? !showBack;

    const actions =
        showActions && big ? (
            <IconButton icon={Sparkles} label="Ask Travis" onPress={() => navigation.navigate("Travis")} filled />
        ) : null;

    if (big) {
        return (
            <View style={[styles.largeHeader, { paddingTop: insets.top + 8, backgroundColor: colors.background }]}>
                <View style={styles.row}>
                    <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: fonts.heading, fontSize: 24, lineHeight: 32, letterSpacing: -0.4, color: colors.foreground }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                            {title}
                        </Text>
                        {subtitle ? (
                            <Text variant="body" tone="muted" numberOfLines={1}>
                                {subtitle}
                            </Text>
                        ) : null}
                    </View>
                    {right}
                    {actions}
                </View>
            </View>
        );
    }

    return (
        <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.background }]}>
            <View style={styles.row}>
                {showBack ? <IconButton icon={ChevronLeft} label="Back" onPress={() => navigation.goBack()} filled /> : null}
                <View style={{ flex: 1, paddingLeft: showBack ? 6 : 4 }}>
                    <Text style={{ fontFamily: fonts.heading, fontSize: 18, lineHeight: 24, color: colors.foreground }} numberOfLines={1}>
                        {title}
                    </Text>
                    {subtitle ? (
                        <Text variant="small" tone="muted" numberOfLines={1}>
                            {subtitle}
                        </Text>
                    ) : null}
                </View>
                {right}
            </View>
        </View>
    );
}

/** Header button: a 44 px squared tile; `filled` gives it the surface + hairline used for Back and actions. */
export function IconButton({
    icon: Icon,
    label,
    onPress,
    filled,
    badge,
}: {
    icon: ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
    label: string;
    onPress: () => void;
    filled?: boolean;
    badge?: number;
}) {
    const { colors } = useTheme();
    return (
        <Pressable
            accessibilityLabel={label}
            hitSlop={8}
            onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                onPress();
            }}
            style={({ pressed }) => [
                styles.iconBtn,
                { backgroundColor: pressed ? colors.secondary : filled ? colors.card : "transparent", transform: [{ scale: pressed ? 0.94 : 1 }] },
                filled ? { borderWidth: 1, borderColor: colors.border } : null,
            ]}
        >
            <Icon size={20} color={colors.foreground} strokeWidth={1.9} />
            {badge ? (
                <View style={[styles.badge, { backgroundColor: colors.badgeBg, borderColor: colors.background }]}>
                    <Text style={{ color: colors.badgeFg, fontFamily: fonts.bold, fontSize: 10 }}>{badge > 99 ? "99+" : badge}</Text>
                </View>
            ) : null}
        </Pressable>
    );
}

/** Scrollable page body with pull-to-refresh and the standard 16px gutter. */
export function ScreenBody({
    children,
    refreshing,
    onRefresh,
    scroll = true,
    padded = true,
    contentStyle,
    footer,
}: {
    children: ReactNode;
    refreshing?: boolean;
    onRefresh?: () => void;
    scroll?: boolean;
    padded?: boolean;
    contentStyle?: StyleProp<ViewStyle>;
    footer?: ReactNode;
}) {
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();
    if (!scroll) {
        return <View style={[{ flex: 1, backgroundColor: colors.background }, padded ? { paddingHorizontal: 20 } : null, contentStyle]}>{children}</View>;
    }
    // The app draws edge-to-edge, so Android no longer shrinks the window for the
    // keyboard; padding keeps focused inputs and the footer's buttons above it.
    return (
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.background }}>
            <ScrollView
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={[{ paddingBottom: insets.bottom + 32, gap: 16 }, padded ? { paddingHorizontal: 20, paddingVertical: 16 } : null, contentStyle]}
                refreshControl={
                    onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.primaryInk} colors={[colors.primary]} /> : undefined
                }
            >
                {children}
            </ScrollView>
            {footer}
        </KeyboardAvoidingView>
    );
}

export function Screen({ children }: { children: ReactNode }) {
    const { colors } = useTheme();
    return <View style={{ flex: 1, backgroundColor: colors.background }}>{children}</View>;
}

/** Sticky bottom action bar (form submit buttons). */
export function BottomBar({ children }: { children: ReactNode }) {
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();
    return (
        <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12), backgroundColor: colors.card, borderTopColor: colors.border }]}>
            {children}
        </View>
    );
}

export function SectionTitle({ title, right, description }: { title: string; right?: ReactNode; description?: string }) {
    return (
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
            <View style={{ flex: 1, gap: 2 }}>
                <Text variant="h3">{title}</Text>
                {description ? (
                    <Text variant="small" tone="muted">
                        {description}
                    </Text>
                ) : null}
            </View>
            {right}
        </View>
    );
}

const styles = StyleSheet.create({
    header: { paddingHorizontal: 20, paddingBottom: 12 },
    largeHeader: { paddingHorizontal: 20, paddingBottom: 8 },
    row: { flexDirection: "row", alignItems: "center", gap: 8 },
    iconBtn: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
    badge: { position: "absolute", top: -5, right: -5, minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 4, borderWidth: 2, alignItems: "center", justifyContent: "center" },
    bottomBar: { flexDirection: "row", gap: 10, paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1 },
});
