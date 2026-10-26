import { useEffect, useRef, type ComponentType, type ReactNode } from "react";
import { Animated, Easing, StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useTheme } from "../../theme/ThemeProvider";
import { radius } from "../../theme/tokens";
import { Text } from "./Text";
import { Button } from "./Button";

/** Pulsing placeholder shaped like the content it stands in for. */
export function Skeleton({ width = "100%", height = 14, rounded = 6, style }: { width?: DimensionValue; height?: number; rounded?: number; style?: StyleProp<ViewStyle> }) {
    const { colors } = useTheme();
    const pulse = useRef(new Animated.Value(0.5)).current;
    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
                Animated.timing(pulse, { toValue: 0.5, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            ]),
        );
        loop.start();
        return () => loop.stop();
    }, [pulse]);
    return <Animated.View style={[{ width, height, borderRadius: rounded, backgroundColor: colors.muted, opacity: pulse }, style]} />;
}

export function ListSkeleton({ rows = 6, avatar = true }: { rows?: number; avatar?: boolean }) {
    const { colors } = useTheme();
    return (
        <View style={{ gap: 10 }}>
            {Array.from({ length: rows }).map((_, i) => (
                <View key={i} style={[styles.skeletonRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    {avatar ? <Skeleton width={36} height={36} rounded={18} /> : null}
                    <View style={{ flex: 1, gap: 8 }}>
                        <Skeleton width="70%" height={13} />
                        <Skeleton width="40%" height={11} />
                    </View>
                </View>
            ))}
        </View>
    );
}

export function EmptyState({
    icon: Icon,
    title,
    description,
    actionLabel,
    onAction,
    compact,
}: {
    icon?: ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
    title: string;
    description?: string;
    actionLabel?: string;
    onAction?: () => void;
    compact?: boolean;
}) {
    const { colors } = useTheme();
    return (
        <View style={[styles.empty, { paddingVertical: compact ? 24 : 48 }]}>
            {Icon ? (
                <View style={[styles.emptyIcon, { backgroundColor: colors.accent }]}>
                    <Icon size={26} color={colors.primaryInk} strokeWidth={1.8} />
                </View>
            ) : null}
            <Text variant="title" center>
                {title}
            </Text>
            {description ? (
                <Text variant="body" tone="muted" center style={{ maxWidth: 300 }}>
                    {description}
                </Text>
            ) : null}
            {actionLabel && onAction ? <Button title={actionLabel} onPress={onAction} size="sm" style={{ marginTop: 6 }} /> : null}
        </View>
    );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
    return (
        <EmptyState
            title="Couldn't load this"
            description={message ?? "Check your connection and try again."}
            actionLabel={onRetry ? "Try again" : undefined}
            onAction={onRetry}
        />
    );
}

/** The project dashboard's progress-ring widget. */
export function ProgressRing({ value, size = 96, stroke = 9, color, children }: { value: number; size?: number; stroke?: number; color?: string; children?: ReactNode }) {
    const { colors } = useTheme();
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const pct = Math.max(0, Math.min(100, value));
    return (
        <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
            <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
                <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.muted} strokeWidth={stroke} fill="none" />
                <Circle
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    stroke={color ?? colors.primaryInk}
                    strokeWidth={stroke}
                    fill="none"
                    strokeDasharray={`${c} ${c}`}
                    strokeDashoffset={c - (pct / 100) * c}
                    strokeLinecap="round"
                    rotation={-90}
                    origin={`${size / 2}, ${size / 2}`}
                />
            </Svg>
            {children}
        </View>
    );
}

export function ProgressBar({ value, color, height = 6 }: { value: number; color?: string; height?: number }) {
    const { colors } = useTheme();
    return (
        <View style={{ height, borderRadius: height, backgroundColor: colors.muted, overflow: "hidden" }}>
            <View style={{ width: `${Math.max(0, Math.min(100, value))}%`, height, borderRadius: height, backgroundColor: color ?? colors.primaryInk }} />
        </View>
    );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
    const { colors } = useTheme();
    return <View style={[{ height: 1, backgroundColor: colors.border }, style]} />;
}

/** A labelled value — the web's "text-[10px] uppercase … / text-xs font-bold" pair. */
export function KeyValue({ label, value, children, mono }: { label: string; value?: string | number | null; children?: ReactNode; mono?: boolean }) {
    return (
        <View style={{ gap: 3 }}>
            <Text variant="overline" tone="muted">
                {label}
            </Text>
            {children ?? (
                <Text variant={mono ? "mono" : "bodyMedium"} style={mono ? { fontSize: 13 } : undefined}>
                    {value === null || value === undefined || value === "" ? "—" : String(value)}
                </Text>
            )}
        </View>
    );
}

export function Banner({ tone = "warning", title, children }: { tone?: "warning" | "destructive" | "info" | "success"; title?: string; children?: ReactNode }) {
    const { colors } = useTheme();
    const c = { warning: colors.warning, destructive: colors.destructive, info: colors.info, success: colors.success }[tone];
    return (
        <View style={[styles.banner, { borderColor: c + "55", backgroundColor: c + "14" }]}>
            {title ? (
                <Text variant="label" color={c}>
                    {title}
                </Text>
            ) : null}
            {typeof children === "string" ? (
                <Text variant="small" color={c}>
                    {children}
                </Text>
            ) : (
                children
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    skeletonRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: radius.md, borderWidth: 1 },
    empty: { alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 24 },
    emptyIcon: { width: 56, height: 56, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 6 },
    banner: { borderWidth: 1, borderRadius: radius.md, padding: 12, gap: 4 },
});
