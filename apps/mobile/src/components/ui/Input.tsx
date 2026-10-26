import { forwardRef, useState, type ComponentType, type ReactNode } from "react";
import { StyleSheet, TextInput, View, type TextInputProps, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";
import { fonts, radius } from "../../theme/tokens";
import { Text } from "./Text";

export type InputProps = TextInputProps & {
    label?: string;
    hint?: string;
    error?: string | null;
    icon?: ComponentType<{ size?: number; color?: string }>;
    right?: ReactNode;
    containerStyle?: StyleProp<ViewStyle>;
    multiline?: boolean;
    required?: boolean;
};

export const Input = forwardRef<TextInput, InputProps>(function Input(
    { label, hint, error, icon: Icon, right, containerStyle, style, multiline, required, editable = true, onFocus, onBlur, ...props },
    ref,
) {
    const { colors, scheme } = useTheme();
    const [focused, setFocused] = useState(false);

    return (
        <View style={[{ gap: 6 }, containerStyle]}>
            {label ? (
                <Text style={{ fontFamily: fonts.medium, fontSize: 13, color: scheme === "dark" ? "#C3C3CB" : colors.mutedForeground }}>
                    {label}
                    {required ? <Text style={{ fontFamily: fonts.medium, fontSize: 13 }} tone="destructive"> *</Text> : null}
                </Text>
            ) : null}
            <View
                style={[
                    styles.field,
                    {
                        borderColor: error ? colors.destructive : focused ? colors.ring : colors.input,
                        borderWidth: error || focused ? 1.5 : 1,
                        backgroundColor: !editable ? colors.muted : scheme === "dark" ? colors.raised : colors.card,
                        minHeight: multiline ? 100 : 50,
                        alignItems: multiline ? "flex-start" : "center",
                    },
                ]}
            >
                {Icon ? (
                    <View style={{ paddingTop: multiline ? 12 : 0 }}>
                        <Icon size={18} color={colors.mutedForeground} />
                    </View>
                ) : null}
                <TextInput
                    ref={ref}
                    editable={editable}
                    multiline={multiline}
                    placeholderTextColor={colors.mutedForeground}
                    selectionColor={colors.primary}
                    onFocus={(e) => {
                        setFocused(true);
                        onFocus?.(e);
                    }}
                    onBlur={(e) => {
                        setFocused(false);
                        onBlur?.(e);
                    }}
                    style={[
                        styles.input,
                        { color: colors.foreground, textAlignVertical: multiline ? "top" : "center", paddingVertical: multiline ? 12 : 0 },
                        style,
                    ]}
                    {...props}
                />
                {right}
            </View>
            {error ? (
                <Text variant="small" tone="destructive">
                    {error}
                </Text>
            ) : hint ? (
                <Text variant="small" tone="muted">
                    {hint}
                </Text>
            ) : null}
        </View>
    );
});

const styles = StyleSheet.create({
    field: { flexDirection: "row", gap: 10, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 14 },
    input: { flex: 1, fontFamily: fonts.body, fontSize: 15, minHeight: 46 },
});
