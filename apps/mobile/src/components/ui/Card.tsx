import type { ComponentType, ReactNode } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";
import { radius } from "../../theme/tokens";
import { Text } from "./Text";

type CardProps = {
    children?: ReactNode;
    style?: StyleProp<ViewStyle>;
    onPress?: () => void;
    onLongPress?: () => void;
    padded?: boolean;
    elevated?: boolean;
};

/** drava Card: one surface step above the background, 1 px hairline, radius 20. */
export function Card({ children, style, onPress, onLongPress, padded = true, elevated = true }: CardProps) {
    const { colors, shadow } = useTheme();
    const base = [
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border, padding: padded ? 16 : 0 },
        elevated ? shadow.sm : null,
        style,
    ];
    if (!onPress && !onLongPress) return <View style={base}>{children}</View>;
    return (
        <Pressable
            onPress={onPress}
            onLongPress={onLongPress}
            delayLongPress={300}
            style={({ pressed }) => [...base, pressed ? { transform: [{ scale: 0.99 }], opacity: 0.94 } : null]}
        >
            {children}
        </Pressable>
    );
}

/**
 * The web's card header: "text-xs font-bold uppercase tracking-wider
 * text-muted-foreground" title with an icon, an optional action on the right.
 */
export function CardHeader({
    title,
    icon: Icon,
    description,
    right,
    divider = true,
    iconColor,
}: {
    title: string;
    icon?: ComponentType<{ size?: number; color?: string }>;
    description?: string;
    right?: ReactNode;
    divider?: boolean;
    iconColor?: string;
}) {
    const { colors } = useTheme();
    return (
        <View style={[styles.header, divider ? { borderBottomWidth: 1, borderBottomColor: colors.border } : null]}>
            <View style={{ flex: 1, gap: 2 }}>
                <View style={styles.titleRow}>
                    {Icon ? <Icon size={15} color={iconColor ?? colors.mutedForeground} /> : null}
                    <Text variant="overline" tone="muted" style={{ fontSize: 11 }}>
                        {title}
                    </Text>
                </View>
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
    card: { borderRadius: radius.lg, borderWidth: 1 },
    header: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
    titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
});
