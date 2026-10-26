import type { ComponentType } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";
import { fonts } from "../../theme/tokens";
import { statusColor, statusLabel } from "../../lib/constants";
import { Text } from "./Text";
import { adapt, onColor } from "../../theme/tone";

/** Converts #rrggbb to rgba with the given alpha — the web's bg-[color]/10 tints. */
export function tint(hex: string, alpha: number) {
    const h = hex.replace("#", "");
    if (h.length !== 6) return hex;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

export function Badge({
    label,
    color,
    variant = "soft",
    icon: Icon,
    size = "sm",
    style,
}: {
    label: string;
    color?: string;
    variant?: "soft" | "solid" | "outline" | "muted";
    icon?: ComponentType<{ size?: number; color?: string }>;
    size?: "xs" | "sm";
    style?: StyleProp<ViewStyle>;
}) {
    const { colors, scheme } = useTheme();
    // Legacy Tailwind hexes from older call sites map onto the drava tones for this theme.
    const c = color ? adapt(color, scheme) : colors.mutedForeground;
    const bg =
        variant === "solid" ? c : variant === "soft" ? tint(c, 0.14) : variant === "muted" ? colors.secondary : "transparent";
    const fg = variant === "solid" ? onColor(c) : variant === "muted" ? colors.mutedForeground : c;
    const border = variant === "outline" ? tint(c, 0.45) : variant === "soft" ? tint(c, 0.24) : "transparent";
    return (
        <View
            style={[
                styles.badge,
                { backgroundColor: bg, borderColor: border, paddingVertical: size === "xs" ? 1 : 3, paddingHorizontal: size === "xs" ? 6 : 8 },
                style,
            ]}
        >
            {Icon ? <Icon size={11} color={fg} /> : null}
            <Text style={{ color: fg, fontFamily: fonts.semibold, fontSize: size === "xs" ? 10 : 11 }} numberOfLines={1}>
                {label}
            </Text>
        </View>
    );
}

/** Task status pill with the status-colors.ts palette. */
export function StatusBadge({ status, size = "sm" }: { status?: string | null; size?: "xs" | "sm" }) {
    useTheme(); // re-render when the theme flips; statusColor follows the active scheme
    const color = statusColor(status);
    return (
        <View style={[styles.badge, { backgroundColor: tint(color, 0.14), borderColor: tint(color, 0.26), paddingVertical: size === "xs" ? 1 : 3, paddingHorizontal: size === "xs" ? 6 : 8 }]}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
            <Text style={{ color, fontFamily: fonts.semibold, fontSize: size === "xs" ? 10 : 11 }}>{statusLabel(status)}</Text>
        </View>
    );
}

export function Dot({ color, size = 8 }: { color: string; size?: number }) {
    return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />;
}

const styles = StyleSheet.create({
    badge: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, borderWidth: 1, alignSelf: "flex-start" },
});
