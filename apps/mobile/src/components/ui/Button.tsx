import { forwardRef, type ComponentType, type ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "../../theme/ThemeProvider";
import { fonts, radius } from "../../theme/tokens";
import { Text } from "./Text";
import { tint } from "./Badge";
import { onColor } from "../../theme/tone";

type Variant = "default" | "secondary" | "outline" | "ghost" | "destructive" | "destructiveOutline" | "success" | "info";
type Size = "sm" | "md" | "lg" | "icon" | "iconSm";

export type ButtonProps = Omit<PressableProps, "children" | "style"> & {
    title?: string;
    children?: ReactNode;
    variant?: Variant;
    size?: Size;
    icon?: ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
    iconRight?: ComponentType<{ size?: number; color?: string }>;
    loading?: boolean;
    fullWidth?: boolean;
    haptic?: boolean;
    style?: StyleProp<ViewStyle>;
};

/** drava Button: primary is Lime with dark ink; one primary action per screen. */
export const Button = forwardRef<View, ButtonProps>(function Button(
    { title, children, variant = "default", size = "md", icon: Icon, iconRight: IconRight, loading, disabled, fullWidth, haptic = true, style, onPress, ...props },
    ref,
) {
    const { colors, scheme } = useTheme();
    const palette: Record<Variant, { bg: string; fg: string; border?: string; pressed: string }> = {
        default: { bg: colors.primary, fg: colors.primaryForeground, pressed: scheme === "dark" ? "#7DEB4C" : "#84F04F" },
        secondary: { bg: colors.secondary, fg: colors.secondaryForeground, border: scheme === "dark" ? "#393B3D" : colors.border, pressed: colors.muted },
        outline: { bg: colors.card, fg: colors.foreground, border: colors.border, pressed: colors.secondary },
        ghost: { bg: "transparent", fg: colors.foreground, pressed: colors.secondary },
        destructive: { bg: colors.destructive, fg: colors.destructiveForeground, pressed: tint(colors.destructive, 0.85) },
        destructiveOutline: { bg: tint(colors.destructive, 0.08), fg: colors.destructive, border: tint(colors.destructive, 0.35), pressed: tint(colors.destructive, 0.16) },
        success: { bg: colors.success, fg: onColor(colors.success), pressed: tint(colors.success, 0.85) },
        info: { bg: colors.info, fg: onColor(colors.info), pressed: tint(colors.info, 0.85) },
    };
    const p = palette[variant];
    const dims: Record<Size, ViewStyle> = {
        sm: { height: 36, paddingHorizontal: 14, borderRadius: radius.sm },
        md: { height: 46, paddingHorizontal: 18, borderRadius: radius.md },
        lg: { height: 54, paddingHorizontal: 22, borderRadius: radius.md },
        icon: { height: 44, width: 44, borderRadius: radius.md },
        iconSm: { height: 34, width: 34, borderRadius: radius.xs + 2 },
    };
    const iconSize = size === "sm" || size === "iconSm" ? 15 : 17;
    const isDisabled = disabled || loading;

    return (
        <Pressable
            ref={ref}
            accessibilityRole="button"
            disabled={isDisabled}
            onPress={(e) => {
                if (haptic) Haptics.selectionAsync().catch(() => {});
                onPress?.(e);
            }}
            style={({ pressed }) => [
                styles.base,
                dims[size],
                {
                    backgroundColor: pressed ? p.pressed : p.bg,
                    borderColor: p.border ?? "transparent",
                    borderWidth: p.border ? 1 : 0,
                    opacity: isDisabled ? 0.55 : 1,
                    alignSelf: fullWidth ? "stretch" : undefined,
                    transform: [{ scale: pressed ? 0.985 : 1 }],
                },
                style,
            ]}
            {...props}
        >
            {loading ? (
                <ActivityIndicator size="small" color={p.fg} />
            ) : (
                <>
                    {Icon ? <Icon size={iconSize} color={p.fg} strokeWidth={2} /> : null}
                    {title ? (
                        <Text style={{ color: p.fg, fontFamily: fonts.semibold, fontSize: size === "sm" ? 13 : size === "lg" ? 15.5 : 14.5 }} numberOfLines={1}>
                            {title}
                        </Text>
                    ) : null}
                    {children}
                    {IconRight ? <IconRight size={iconSize} color={p.fg} /> : null}
                </>
            )}
        </Pressable>
    );
});

const styles = StyleSheet.create({
    base: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
});
