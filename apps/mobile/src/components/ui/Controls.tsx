import { useState, type ComponentType, type ReactNode } from "react";
import { Platform, Pressable, StyleSheet, Switch as RNSwitch, TextInput, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Calendar, Check, ChevronRight, Search, X } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "../../theme/ThemeProvider";
import { fonts, radius } from "../../theme/tokens";
import { fmtDate } from "../../lib/format";
import { Text } from "./Text";
import { Sheet } from "./Sheet";
import { Button } from "./Button";

export function Checkbox({ checked, onChange, disabled, size = 20 }: { checked: boolean; onChange?: (v: boolean) => void; disabled?: boolean; size?: number }) {
    const { colors } = useTheme();
    return (
        <Pressable
            hitSlop={8}
            disabled={disabled || !onChange}
            onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                onChange?.(!checked);
            }}
            style={[
                styles.checkbox,
                {
                    width: size,
                    height: size,
                    borderColor: checked ? colors.primary : colors.mutedForeground,
                    backgroundColor: checked ? colors.primary : "transparent",
                    opacity: disabled ? 0.5 : 1,
                },
            ]}
        >
            {checked ? <Check size={size * 0.7} color={colors.primaryForeground} strokeWidth={3} /> : null}
        </Pressable>
    );
}

export function Switch({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
    const { colors } = useTheme();
    return (
        <RNSwitch
            value={value}
            disabled={disabled}
            onValueChange={(v) => {
                Haptics.selectionAsync().catch(() => {});
                onChange(v);
            }}
            trackColor={{ false: colors.input, true: colors.primary }}
            thumbColor={Platform.OS === "android" ? "#ffffff" : undefined}
            ios_backgroundColor={colors.input}
        />
    );
}

export function SwitchRow({ label, description, value, onChange, disabled }: { label: string; description?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
    // The whole row toggles, like the web's <Label htmlFor> around a Switch.
    return (
        <Pressable
            disabled={disabled}
            onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                onChange(!value);
            }}
            style={styles.switchRow}
        >
            <View style={{ flex: 1, gap: 2 }}>
                <Text variant="bodyMedium">{label}</Text>
                {description ? (
                    <Text variant="small" tone="muted">
                        {description}
                    </Text>
                ) : null}
            </View>
            <Switch value={value} onChange={onChange} disabled={disabled} />
        </Pressable>
    );
}

/** Filter chip — toggles, shows a dot/count when active. */
export function Chip({
    label,
    active,
    onPress,
    icon: Icon,
    color,
    onClear,
}: {
    label: string;
    active?: boolean;
    onPress?: () => void;
    icon?: ComponentType<{ size?: number; color?: string }>;
    color?: string;
    onClear?: () => void;
}) {
    const { colors } = useTheme();
    // drava filter chip: inverted (foreground-filled) when on, quiet surface when off.
    const fg = active ? colors.background : colors.foreground;
    return (
        <Pressable
            onPress={onPress}
            style={({ pressed }) => [
                styles.chip,
                {
                    backgroundColor: active ? colors.foreground : pressed ? colors.secondary : colors.card,
                    borderColor: active ? colors.foreground : colors.border,
                },
            ]}
        >
            {color ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} /> : null}
            {Icon ? <Icon size={14} color={fg} /> : null}
            <Text style={{ fontFamily: active ? fonts.semibold : fonts.medium, fontSize: 13, color: fg }} numberOfLines={1}>
                {label}
            </Text>
            {active && onClear ? (
                <Pressable hitSlop={8} onPress={onClear}>
                    <X size={13} color={fg} />
                </Pressable>
            ) : null}
        </Pressable>
    );
}

export function SearchBar({ value, onChangeText, placeholder = "Search…", right }: { value: string; onChangeText: (v: string) => void; placeholder?: string; right?: ReactNode }) {
    const { colors } = useTheme();
    return (
        <View style={[styles.search, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Search size={18} color={colors.mutedForeground} />
            <TextInput
                value={value}
                onChangeText={onChangeText}
                placeholder={placeholder}
                placeholderTextColor={colors.mutedForeground}
                selectionColor={colors.primary}
                autoCorrect={false}
                returnKeyType="search"
                style={{ flex: 1, fontFamily: fonts.body, fontSize: 15, color: colors.foreground, height: 46 }}
            />
            {value ? (
                <Pressable hitSlop={8} onPress={() => onChangeText("")}>
                    <X size={16} color={colors.mutedForeground} />
                </Pressable>
            ) : null}
            {right}
        </View>
    );
}

/** Date (or date-time) field. Android shows the system dialog; iOS a spinner in a sheet. */
export function DateField({
    label,
    value,
    onChange,
    mode = "date",
    placeholder = "Pick a date",
    minimumDate,
    maximumDate,
    clearable,
    required,
    error,
    pattern,
}: {
    label?: string;
    value: Date | null;
    onChange: (d: Date | null) => void;
    mode?: "date" | "time" | "datetime";
    placeholder?: string;
    minimumDate?: Date;
    maximumDate?: Date;
    clearable?: boolean;
    required?: boolean;
    error?: string | null;
    pattern?: string;
}) {
    const { colors, scheme } = useTheme();
    const [open, setOpen] = useState(false);
    const [androidStage, setAndroidStage] = useState<"date" | "time" | null>(null);
    const [draft, setDraft] = useState<Date>(value ?? new Date());
    const display = value ? fmtDate(value, pattern ?? (mode === "time" ? "h:mm a" : mode === "datetime" ? "dd MMM yyyy, h:mm a" : "dd MMM yyyy")) : undefined;

    const begin = () => {
        setDraft(value ?? new Date());
        if (Platform.OS === "android") setAndroidStage(mode === "time" ? "time" : "date");
        else setOpen(true);
    };

    return (
        <View style={{ gap: 6 }}>
            {label ? (
                <Text style={{ fontFamily: fonts.medium, fontSize: 13, color: scheme === "dark" ? "#C3C3CB" : colors.mutedForeground }}>
                    {label}
                    {required ? <Text style={{ fontFamily: fonts.medium, fontSize: 13 }} tone="destructive"> *</Text> : null}
                </Text>
            ) : null}
            <Pressable
                onPress={begin}
                style={({ pressed }) => [styles.field, { borderColor: error ? colors.destructive : colors.input, backgroundColor: pressed ? colors.secondary : scheme === "dark" ? colors.raised : colors.card }]}
            >
                <Calendar size={16} color={colors.mutedForeground} />
                <Text style={{ flex: 1, fontSize: 15 }} tone={display ? "default" : "muted"}>
                    {display ?? placeholder}
                </Text>
                {clearable && value ? (
                    <Pressable hitSlop={8} onPress={() => onChange(null)}>
                        <X size={16} color={colors.mutedForeground} />
                    </Pressable>
                ) : null}
            </Pressable>
            {error ? (
                <Text variant="small" tone="destructive">
                    {error}
                </Text>
            ) : null}

            {Platform.OS === "android" && androidStage ? (
                <DateTimePicker
                    value={draft}
                    mode={androidStage}
                    minimumDate={minimumDate}
                    maximumDate={maximumDate}
                    onChange={(event, picked) => {
                        if (event.type !== "set" || !picked) {
                            setAndroidStage(null);
                            return;
                        }
                        if (mode === "datetime" && androidStage === "date") {
                            const next = new Date(picked);
                            next.setHours(draft.getHours(), draft.getMinutes());
                            setDraft(next);
                            setAndroidStage("time");
                            return;
                        }
                        const next = new Date(androidStage === "time" ? draft : picked);
                        if (androidStage === "time") next.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
                        setAndroidStage(null);
                        onChange(next);
                    }}
                />
            ) : null}

            <Sheet
                open={open}
                onClose={() => setOpen(false)}
                title={label ?? "Pick a date"}
                footer={
                    <>
                        <Button title="Cancel" variant="outline" style={{ flex: 1 }} onPress={() => setOpen(false)} />
                        <Button
                            title="Done"
                            style={{ flex: 1 }}
                            onPress={() => {
                                setOpen(false);
                                onChange(draft);
                            }}
                        />
                    </>
                }
            >
                <View style={{ alignItems: "center" }}>
                    <DateTimePicker
                        value={draft}
                        mode={mode}
                        display={mode === "date" ? "inline" : "spinner"}
                        themeVariant={scheme}
                        accentColor={colors.primary}
                        minimumDate={minimumDate}
                        maximumDate={maximumDate}
                        onChange={(_, picked) => picked && setDraft(picked)}
                    />
                </View>
            </Sheet>
        </View>
    );
}

/** Settings-style row: icon, label, optional value, chevron. */
export function ListRow({
    icon: Icon,
    label,
    description,
    value,
    onPress,
    right,
    destructive,
    iconColor,
}: {
    icon?: ComponentType<{ size?: number; color?: string }>;
    label: string;
    description?: string;
    value?: string;
    onPress?: () => void;
    right?: ReactNode;
    destructive?: boolean;
    iconColor?: string;
}) {
    const { colors } = useTheme();
    return (
        <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.listRow, { backgroundColor: pressed ? colors.secondary : "transparent" }]}>
            {Icon ? (
                <View style={[styles.listIcon, { backgroundColor: destructive ? colors.destructive + "22" : colors.iconTile }]}>
                    <Icon size={17} color={destructive ? colors.destructive : iconColor ?? colors.foreground} />
                </View>
            ) : null}
            <View style={{ flex: 1, gap: 1 }}>
                <Text variant="bodyMedium" tone={destructive ? "destructive" : "default"}>
                    {label}
                </Text>
                {description ? (
                    <Text variant="small" tone="muted" numberOfLines={2}>
                        {description}
                    </Text>
                ) : null}
            </View>
            {value ? (
                <Text variant="small" tone="muted">
                    {value}
                </Text>
            ) : null}
            {right ?? (onPress ? <ChevronRight size={17} color={colors.mutedForeground} /> : null)}
        </Pressable>
    );
}

const styles = StyleSheet.create({
    checkbox: { borderRadius: 7, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
    switchRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6 },
    chip: { flexDirection: "row", alignItems: "center", gap: 6, height: 36, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1 },
    search: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, borderRadius: radius.md, borderWidth: 1 },
    field: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 50, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 14 },
    listRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderRadius: radius.md },
    listIcon: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center" },
});
