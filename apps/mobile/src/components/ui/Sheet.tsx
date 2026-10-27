import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Modal, PanResponder, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import { useTheme } from "../../theme/ThemeProvider";
import { radius } from "../../theme/tokens";
import { Text } from "./Text";
import { Toaster } from "../../lib/toast";
import { KeyboardInset } from "./KeyboardInset";

export type SheetProps = {
    open: boolean;
    onClose: () => void;
    title?: string;
    description?: string;
    children: ReactNode;
    footer?: ReactNode;
    /** Fraction of screen height the sheet may grow to. */
    maxHeight?: number;
    scroll?: boolean;
    fullHeight?: boolean;
};

/**
 * Bottom sheet — the native counterpart of the web's Dialog / Sheet. Drag the
 * handle down or tap the backdrop to dismiss.
 */
export function Sheet({ open, onClose, title, description, children, footer, maxHeight = 0.9, scroll = true, fullHeight }: SheetProps) {
    const { colors, shadow, scheme } = useTheme();
    const insets = useSafeAreaInsets();
    const { height } = useWindowDimensions();
    const [visible, setVisible] = useState(open);
    const translate = useRef(new Animated.Value(height)).current;
    const backdrop = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (open) {
            setVisible(true);
            Animated.parallel([
                Animated.spring(translate, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 240, mass: 0.9 }),
                Animated.timing(backdrop, { toValue: 1, duration: 180, useNativeDriver: true }),
            ]).start();
        } else if (visible) {
            Animated.parallel([
                Animated.timing(translate, { toValue: height, duration: 200, useNativeDriver: true }),
                Animated.timing(backdrop, { toValue: 0, duration: 180, useNativeDriver: true }),
            ]).start(() => setVisible(false));
        }
    }, [open, visible, translate, backdrop, height]);

    const pan = useRef(
        PanResponder.create({
            onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
            onPanResponderMove: (_, g) => g.dy > 0 && translate.setValue(g.dy),
            onPanResponderRelease: (_, g) => {
                if (g.dy > 110 || g.vy > 1.1) onClose();
                else Animated.spring(translate, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 240 }).start();
            },
        }),
    ).current;

    if (!visible) return null;

    const Body = scroll ? ScrollView : View;

    return (
        <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
            <KeyboardInset style={{ flex: 1 }}>
                <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay, opacity: backdrop }]}>
                    <Pressable style={{ flex: 1 }} onPress={onClose} />
                </Animated.View>
                <View style={{ flex: 1, justifyContent: "flex-end" }} pointerEvents="box-none">
                    <Animated.View
                        style={[
                            styles.sheet,
                            shadow.lg,
                            {
                                backgroundColor: colors.popover,
                                borderColor: colors.border,
                                borderTopWidth: scheme === "dark" ? 1 : 0,
                                // A share of the space left above the keyboard, not of the
                                // whole window, so the header never slides off the top.
                                maxHeight: `${maxHeight * 100}%`,
                                height: fullHeight ? `${maxHeight * 100}%` : undefined,
                                paddingBottom: Math.max(insets.bottom, 12),
                                transform: [{ translateY: translate }],
                            },
                        ]}
                    >
                        <View {...pan.panHandlers} style={styles.handleArea}>
                            <View style={[styles.handle, { backgroundColor: scheme === "dark" ? "#393B3D" : colors.input }]} />
                            {title ? (
                                <View style={styles.header}>
                                    <View style={{ flex: 1, gap: 2 }}>
                                        <Text variant="h2">{title}</Text>
                                        {description ? (
                                            <Text variant="small" tone="muted">
                                                {description}
                                            </Text>
                                        ) : null}
                                    </View>
                                    <Pressable hitSlop={10} onPress={onClose} style={[styles.close, { backgroundColor: colors.secondary }]}>
                                        <X size={18} color={colors.mutedForeground} />
                                    </Pressable>
                                </View>
                            ) : null}
                        </View>
                        <Body
                            style={fullHeight ? { flex: 1 } : undefined}
                            contentContainerStyle={scroll ? { paddingHorizontal: 20, paddingBottom: 12, gap: 14 } : undefined}
                            keyboardShouldPersistTaps="handled"
                            showsVerticalScrollIndicator={false}
                        >
                            {/* flex: 1 only when the sheet has a fixed height — in a content-sized sheet it collapses to 0. */}
                            {scroll ? children : <View style={[{ paddingHorizontal: 20, gap: 14 }, fullHeight ? { flex: 1 } : null]}>{children}</View>}
                        </Body>
                        {footer ? <View style={[styles.footer, { borderTopColor: colors.border }]}>{footer}</View> : null}
                    </Animated.View>
                </View>
            </KeyboardInset>
            <Toaster />
        </Modal>
    );
}

const styles = StyleSheet.create({
    sheet: { borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, overflow: "hidden", borderLeftWidth: 0, borderRightWidth: 0 },
    handleArea: { paddingTop: 10, paddingBottom: 4 },
    handle: { width: 40, height: 5, borderRadius: 3, alignSelf: "center", marginBottom: 10 },
    header: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingHorizontal: 20, paddingBottom: 14 },
    close: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
    footer: { flexDirection: "row", gap: 10, paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1 },
});
