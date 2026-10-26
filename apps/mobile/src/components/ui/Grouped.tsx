import { Children, Fragment, type ComponentType, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "../../theme/ThemeProvider";
import { fonts, radius } from "../../theme/tokens";
import { Text } from "./Text";
import { tint } from "./Badge";

type IconType = ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

/**
 * drava icon tile: one neutral tile colour for every menu glyph (colour comes
 * from data, not menus). `destructive` tints it coral.
 */
export function IconTile({ icon: Icon, size = 36, destructive }: { icon: IconType; color?: string; size?: number; destructive?: boolean }) {
    const { colors } = useTheme();
    return (
        <View style={[styles.tile, { width: size, height: size, borderRadius: size * 0.31, backgroundColor: destructive ? tint(colors.destructive, 0.14) : colors.iconTile }]}>
            <Icon size={size * 0.5} color={destructive ? colors.destructive : colors.iconTileFg} strokeWidth={1.9} />
        </View>
    );
}

/**
 * Inset grouped list: an optional caption above one rounded card whose rows are
 * split by inset hairlines.
 */
export function Section({ title, footer, children }: { title?: string; footer?: string; children: ReactNode }) {
    const { colors } = useTheme();
    const rows = Children.toArray(children).filter(Boolean);
    return (
        <View style={{ gap: 8 }}>
            {title ? (
                <Text variant="overline" tone="muted" style={{ paddingHorizontal: 4 }}>
                    {title}
                </Text>
            ) : null}
            <View style={[styles.group, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {rows.map((row, i) => (
                    <Fragment key={i}>
                        {i > 0 ? <View style={[styles.divider, { backgroundColor: colors.border }]} /> : null}
                        {row}
                    </Fragment>
                ))}
            </View>
            {footer ? (
                <Text variant="small" tone="muted" style={{ paddingHorizontal: 6 }}>
                    {footer}
                </Text>
            ) : null}
        </View>
    );
}

export function GroupedRow({
    icon,
    iconColor,
    label,
    description,
    value,
    badge,
    onPress,
    right,
    destructive,
    chevron = true,
}: {
    icon?: IconType;
    iconColor?: string;
    label: string;
    description?: string;
    value?: string;
    badge?: number;
    onPress?: () => void;
    right?: ReactNode;
    destructive?: boolean;
    chevron?: boolean;
}) {
    const { colors } = useTheme();
    return (
        <Pressable
            disabled={!onPress}
            onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                onPress?.();
            }}
            style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.secondary : "transparent" }]}
        >
            {icon ? <IconTile icon={icon} color={iconColor} destructive={destructive} /> : null}
            <View style={{ flex: 1, gap: 1 }}>
                <Text style={{ fontFamily: fonts.medium, fontSize: 15, color: destructive ? colors.destructive : colors.foreground }} numberOfLines={1}>
                    {label}
                </Text>
                {description ? (
                    <Text variant="small" tone="muted" numberOfLines={2}>
                        {description}
                    </Text>
                ) : null}
            </View>
            {value ? (
                <Text variant="body" tone="muted" numberOfLines={1} style={{ maxWidth: "45%" }}>
                    {value}
                </Text>
            ) : null}
            {badge ? (
                <View style={[styles.badge, { backgroundColor: colors.badgeBg }]}>
                    <Text style={{ fontFamily: fonts.bold, fontSize: 11, color: colors.badgeFg }}>{badge > 99 ? "99+" : badge}</Text>
                </View>
            ) : null}
            {right}
            {onPress && chevron && !destructive ? <ChevronRight size={18} color={colors.mutedForeground} /> : null}
        </Pressable>
    );
}

const styles = StyleSheet.create({
    tile: { alignItems: "center", justifyContent: "center" },
    group: { borderRadius: radius.lg, overflow: "hidden", borderWidth: 1 },
    divider: { height: 1, marginLeft: 66 },
    row: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, minHeight: 60, paddingVertical: 11 },
    badge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" },
});
