import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CheckCircle2, Info, XCircle, AlertTriangle } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "../theme/ThemeProvider";
import { fonts, radius } from "../theme/tokens";

/** sonner-style API, matching apps/web/src/lib/toast.ts usage: toast.success("…"). */
type Kind = "success" | "error" | "info" | "warning";
type ToastItem = { id: number; kind: Kind; title: string; description?: string };

/**
 * Mounted toasters, newest last. A Modal (sheet, dialog) is its own native
 * window above the app, so the root toaster would render underneath it; each
 * modal mounts a toaster too and the newest one shows the toast.
 */
const hosts: ((item: Omit<ToastItem, "id">) => void)[] = [];
const push = (item: Omit<ToastItem, "id">) => hosts[hosts.length - 1]?.(item);
let seq = 0;

const show = (kind: Kind) => (title: string, options?: { description?: string }) => {
    if (kind === "success") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (kind === "error") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    push({ kind, title, description: options?.description });
};

export const toast = {
    success: show("success"),
    error: show("error"),
    info: show("info"),
    warning: show("warning"),
    /** Shows an Error/ApiError message, or the fallback. */
    fromError: (error: unknown, fallback = "Something went wrong") =>
        show("error")(error instanceof Error && error.message ? error.message : fallback),
};

export function Toaster() {
    const [items, setItems] = useState<ToastItem[]>([]);
    const insets = useSafeAreaInsets();

    const shown = useRef<ToastItem[]>([]);
    shown.current = items;

    useEffect(() => {
        const host = (item: Omit<ToastItem, "id">) => {
            const id = ++seq;
            setItems((current) => [...current.slice(-2), { ...item, id }]);
            setTimeout(() => setItems((current) => current.filter((t) => t.id !== id)), item.kind === "error" ? 5000 : 3200);
        };
        hosts.push(host);
        return () => {
            hosts.splice(hosts.indexOf(host), 1);
            // A sheet that closes right after toasting ("Saved") hands its toasts down.
            shown.current.forEach(({ id: _id, ...item }) => push(item));
        };
    }, []);

    return (
        <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { paddingTop: insets.top + 8 }]}>
            {items.map((item) => (
                <ToastCard key={item.id} item={item} onDismiss={() => setItems((c) => c.filter((t) => t.id !== item.id))} />
            ))}
        </View>
    );
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
    const { colors, shadow } = useTheme();
    const anim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.spring(anim, { toValue: 1, useNativeDriver: true, damping: 18, stiffness: 220 }).start();
    }, [anim]);

    const Icon = { success: CheckCircle2, error: XCircle, info: Info, warning: AlertTriangle }[item.kind];
    const tint = { success: colors.success, error: colors.destructive, info: colors.info, warning: colors.warning }[item.kind];

    return (
        <Animated.View
            style={{
                opacity: anim,
                transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) }],
                marginHorizontal: 16,
                marginBottom: 8,
            }}
        >
            <Pressable
                onPress={onDismiss}
                style={[
                    styles.card,
                    shadow.md,
                    { backgroundColor: colors.popover, borderColor: colors.border },
                ]}
            >
                <Icon size={18} color={tint} />
                <View style={{ flex: 1 }}>
                    <Text style={[styles.title, { color: colors.foreground }]}>{item.title}</Text>
                    {item.description ? (
                        <Text style={[styles.description, { color: colors.mutedForeground }]} numberOfLines={2}>
                            {item.description}
                        </Text>
                    ) : null}
                </View>
            </Pressable>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    card: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 10,
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderRadius: radius.md,
        borderWidth: 1,
    },
    title: { fontFamily: fonts.semibold, fontSize: 14 },
    description: { fontFamily: fonts.body, fontSize: 12, marginTop: 2 },
});
