import React, { useCallback, useEffect } from "react";
import {
    Modal,
    Pressable,
    StyleProp,
    StyleSheet,
    useWindowDimensions,
    View,
    ViewStyle,
} from "react-native";
import BlurView from "./BlurView";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
    Extrapolation,
    interpolate,
    runOnJS,
    useAnimatedKeyboard,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from "react-native-reanimated";

import { BORDER_RADIUS, MOTION, Z_INDEX } from "../constants/theme";
import { useTheme } from "../context/ThemeContext";
import { useResponsive } from "../hooks/useResponsive";
import { haptics } from "../services/haptics";

const DISMISS_THRESHOLD = 120;
/** Cap for the sheet's width once it "floats" as a centered dialog on tablet/desktop. */
const SHEET_MAX_WIDTH = 480;

interface SheetProps {
    visible: boolean;
    onClose: () => void;
    children: React.ReactNode;
    /** Disable drag-down-to-dismiss. */
    dismissable?: boolean;
    style?: StyleProp<ViewStyle>;
    /** Accessible title announced when the sheet opens. */
    accessibilityLabel?: string;
}

/**
 * Premium bottom sheet: blurred backdrop, grabber, rubber-band drag-to-dismiss,
 * and keyboard-aware lift so focused inputs stay visible. Wrap modal *content*
 * in this instead of a bare <Modal animationType>. Mount it always and drive
 * with `visible` — it manages its own enter/exit.
 */
export default function Sheet({ visible, onClose, children, dismissable = true, style, accessibilityLabel }: SheetProps) {
    const { colors, isDark } = useTheme();
    const insets = useSafeAreaInsets();
    const keyboard = useAnimatedKeyboard();
    const { height } = useWindowDimensions();
    const { isTablet, isDesktop } = useResponsive();

    const [mounted, setMounted] = React.useState(visible);
    const translateY = useSharedValue(height);

    // On tablets/desktops a full-bleed bottom sheet reads as a UI bug (a form
    // stretched edge-to-edge across a 10"+ screen), so it's capped to a
    // dialog-like width and centered instead of spanning the whole viewport.
    const { width } = useWindowDimensions();
    const floating = isTablet || isDesktop;
    const horizontalInset = floating ? Math.max(0, (width - SHEET_MAX_WIDTH) / 2) : 0;

    const finishClose = useCallback(() => setMounted(false), []);

    const animateOut = useCallback(() => {
        translateY.value = withTiming(height, { duration: MOTION.duration.base }, (finished) => {
            if (finished) runOnJS(finishClose)();
        });
    }, [translateY, finishClose, height]);

    const requestClose = useCallback(() => {
        animateOut();
        runOnJS(onClose)();
    }, [animateOut, onClose]);

    useEffect(() => {
        if (visible) {
            setMounted(true);
            requestAnimationFrame(() => {
                translateY.value = withSpring(0, MOTION.spring.gentle);
            });
        } else if (mounted) {
            animateOut();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible]);

    const pan = Gesture.Pan()
        .enabled(dismissable)
        // Only a deliberate downward drag dismisses. Without this an upward
        // flick anywhere in the sheet was swallowed by the pan, which is why
        // scrollable sheet content could not be scrolled at all.
        .activeOffsetY(8)
        .failOffsetY(-8)
        .onChange((e) => {
            translateY.value = Math.max(0, translateY.value + e.changeY);
        })
        .onEnd((e) => {
            if (translateY.value > DISMISS_THRESHOLD || e.velocityY > 800) {
                runOnJS(haptics.light)();
                translateY.value = withTiming(height, { duration: MOTION.duration.base }, (finished) => {
                    if (finished) runOnJS(finishClose)();
                });
                runOnJS(onClose)();
            } else {
                translateY.value = withSpring(0, MOTION.spring.snappy);
            }
        });

    const sheetStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: translateY.value - keyboard.height.value }],
    }));

    const backdropStyle = useAnimatedStyle(() => ({
        opacity: interpolate(translateY.value, [0, height], [1, 0], Extrapolation.CLAMP),
    }));

    if (!mounted) return null;

    return (
        <Modal transparent visible={mounted} onRequestClose={requestClose} statusBarTranslucent animationType="none">
            {/* Content inside a RN Modal lives in a detached view tree — it needs its
                own GestureHandlerRootView for the swipe-to-dismiss pan to register. */}
            <GestureHandlerRootView style={StyleSheet.absoluteFill}>
                <Animated.View style={[StyleSheet.absoluteFill, { zIndex: Z_INDEX.sheetBackdrop }, backdropStyle]}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={requestClose} accessibilityLabel="Close">
                        <BlurView intensity={isDark ? 40 : 25} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
                        <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.35)" }]} />
                    </Pressable>
                </Animated.View>

                <Animated.View
                    accessibilityViewIsModal
                    accessibilityLabel={accessibilityLabel}
                    style={[
                        styles.sheet,
                        {
                            backgroundColor: colors.surface,
                            paddingBottom: insets.bottom + 8,
                            zIndex: Z_INDEX.sheet,
                            left: horizontalInset,
                            right: horizontalInset,
                            // Floating on a big screen looks better as a full dialog
                            // card (rounded on every corner, lifted off the edge)
                            // rather than a bottom-anchored phone sheet.
                            ...(floating
                                ? {
                                      bottom: insets.bottom + 24,
                                      borderBottomLeftRadius: BORDER_RADIUS.xl,
                                      borderBottomRightRadius: BORDER_RADIUS.xl,
                                      maxHeight: "80%",
                                  }
                                : null),
                        },
                        sheetStyle,
                        style,
                    ]}
                >
                    {/* Drag-to-dismiss lives on the grabber rather than the whole
                        sheet: a pan over the body would capture vertical gestures
                        before any scrollable child could use them. Backdrop tap
                        still dismisses. */}
                    <GestureDetector gesture={pan}>
                        <View style={styles.grabberArea}>
                            <View style={[styles.grabber, { backgroundColor: colors.border }]} />
                        </View>
                    </GestureDetector>
                    {children}
                </Animated.View>
            </GestureHandlerRootView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    sheet: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        borderTopLeftRadius: BORDER_RADIUS.xl,
        borderTopRightRadius: BORDER_RADIUS.xl,
        paddingTop: 8,
        maxHeight: "92%",
    },
    grabberArea: {
        alignSelf: "stretch",
        alignItems: "center",
        paddingTop: 2,
        paddingBottom: 6,
    },
    grabber: {
        alignSelf: "center",
        width: 40,
        height: 5,
        borderRadius: 3,
        marginBottom: 8,
    },
});
