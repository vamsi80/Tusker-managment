import { Text as RNText, type TextProps, type TextStyle } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";
import { fonts, fontSize } from "../../theme/tokens";

type Variant = "h1" | "h2" | "h3" | "title" | "body" | "bodyMedium" | "small" | "caption" | "label" | "overline" | "mono";
type Tone = "default" | "muted" | "primary" | "destructive" | "success" | "warning" | "info" | "inverse";

/** drava type scale: Archivo Expanded for headings and numbers, Inter for everything you read. */
const VARIANTS: Record<Variant, TextStyle> = {
    h1: { fontFamily: fonts.heading, fontSize: fontSize["2xl"], lineHeight: 28, letterSpacing: -0.3 },
    h2: { fontFamily: fonts.heading, fontSize: fontSize.xl, lineHeight: 24, letterSpacing: -0.1 },
    h3: { fontFamily: fonts.heading, fontSize: fontSize.lg, lineHeight: 22 },
    title: { fontFamily: fonts.semibold, fontSize: fontSize.base, lineHeight: 20 },
    body: { fontFamily: fonts.body, fontSize: fontSize.sm, lineHeight: 20 },
    bodyMedium: { fontFamily: fonts.medium, fontSize: fontSize.sm, lineHeight: 20 },
    small: { fontFamily: fonts.body, fontSize: fontSize.xs, lineHeight: 16 },
    caption: { fontFamily: fonts.medium, fontSize: 11, lineHeight: 14 },
    label: { fontFamily: fonts.semibold, fontSize: fontSize.xs },
    /** Field and section labels: 11 px Inter caps, generous tracking. */
    overline: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 1, textTransform: "uppercase" },
    mono: { fontFamily: fonts.mono, fontSize: fontSize.xs, fontVariant: ["tabular-nums"] },
};

export type AppTextProps = TextProps & { variant?: Variant; tone?: Tone; color?: string; weight?: keyof typeof fonts; center?: boolean };

export function Text({ variant = "body", tone = "default", color, weight, center, style, ...props }: AppTextProps) {
    const { colors } = useTheme();
    const toneColor = {
        default: colors.foreground,
        muted: colors.mutedForeground,
        primary: colors.primaryInk,
        destructive: colors.destructive,
        success: colors.success,
        warning: colors.warning,
        info: colors.info,
        inverse: colors.background,
    }[tone];
    return (
        <RNText
            {...props}
            style={[
                VARIANTS[variant],
                { color: color ?? toneColor },
                weight ? { fontFamily: fonts[weight] } : null,
                center ? { textAlign: "center" } : null,
                style,
            ]}
        />
    );
}
