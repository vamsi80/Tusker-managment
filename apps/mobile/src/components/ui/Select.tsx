import { useMemo, useState, type ReactNode } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { Check, ChevronDown, Search } from "lucide-react-native";
import { useTheme } from "../../theme/ThemeProvider";
import { fonts, radius } from "../../theme/tokens";
import { Sheet } from "./Sheet";
import { Text } from "./Text";
import { Input } from "./Input";

export type Option<V extends string = string> = {
    value: V;
    label: string;
    description?: string;
    left?: ReactNode;
    disabled?: boolean;
};

type BaseProps<V extends string> = {
    label?: string;
    placeholder?: string;
    options: Option<V>[];
    searchable?: boolean;
    disabled?: boolean;
    error?: string | null;
    required?: boolean;
    title?: string;
    /** Render a custom trigger instead of the field. */
    trigger?: (open: () => void, selectedLabel: string | null) => ReactNode;
};

/** Single select — the web's shadcn Select / Combobox, opened as a sheet. */
export function Select<V extends string = string>({
    value,
    onChange,
    allowClear,
    ...props
}: BaseProps<V> & { value: V | null | undefined; onChange: (value: V | null) => void; allowClear?: boolean }) {
    const [open, setOpen] = useState(false);
    const selected = props.options.find((o) => o.value === value);
    return (
        <>
            {props.trigger ? (
                props.trigger(() => !props.disabled && setOpen(true), selected?.label ?? null)
            ) : (
                <SelectField label={props.label} required={props.required} error={props.error} disabled={props.disabled} onPress={() => setOpen(true)} text={selected?.label} placeholder={props.placeholder} left={selected?.left} />
            )}
            <OptionSheet
                open={open}
                onClose={() => setOpen(false)}
                title={props.title ?? props.label ?? "Select"}
                options={props.options}
                searchable={props.searchable ?? props.options.length > 8}
                isSelected={(v) => v === value}
                onPick={(v) => {
                    onChange(v === value && allowClear ? null : v);
                    setOpen(false);
                }}
            />
        </>
    );
}

/** Multi select with checkmarks; used for filters, assignees, tags, approvers. */
export function MultiSelect<V extends string = string>({
    values,
    onChange,
    ...props
}: BaseProps<V> & { values: V[]; onChange: (values: V[]) => void }) {
    const [open, setOpen] = useState(false);
    const labels = props.options.filter((o) => values.includes(o.value)).map((o) => o.label);
    const text = labels.length === 0 ? undefined : labels.length <= 2 ? labels.join(", ") : `${labels.length} selected`;
    return (
        <>
            {props.trigger ? (
                props.trigger(() => !props.disabled && setOpen(true), text ?? null)
            ) : (
                <SelectField label={props.label} required={props.required} error={props.error} disabled={props.disabled} onPress={() => setOpen(true)} text={text} placeholder={props.placeholder} />
            )}
            <OptionSheet
                open={open}
                onClose={() => setOpen(false)}
                title={props.title ?? props.label ?? "Select"}
                options={props.options}
                searchable={props.searchable ?? props.options.length > 8}
                multi
                isSelected={(v) => values.includes(v)}
                onPick={(v) => onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v])}
                onClear={values.length ? () => onChange([]) : undefined}
            />
        </>
    );
}

export function SelectField({
    label,
    text,
    placeholder,
    onPress,
    disabled,
    error,
    required,
    left,
}: {
    label?: string;
    text?: string;
    placeholder?: string;
    onPress: () => void;
    disabled?: boolean;
    error?: string | null;
    required?: boolean;
    left?: ReactNode;
}) {
    const { colors, scheme } = useTheme();
    return (
        <View style={{ gap: 6 }}>
            {label ? (
                <Text style={{ fontFamily: fonts.medium, fontSize: 13, color: scheme === "dark" ? "#C3C3CB" : colors.mutedForeground }}>
                    {label}
                    {required ? <Text style={{ fontFamily: fonts.medium, fontSize: 13 }} tone="destructive"> *</Text> : null}
                </Text>
            ) : null}
            <Pressable
                disabled={disabled}
                onPress={onPress}
                style={({ pressed }) => [
                    styles.field,
                    {
                        borderColor: error ? colors.destructive : colors.input,
                        backgroundColor: disabled ? colors.muted : pressed ? colors.secondary : scheme === "dark" ? colors.raised : colors.card,
                    },
                ]}
            >
                {left}
                <Text numberOfLines={1} style={{ flex: 1, fontSize: 15 }} tone={text ? "default" : "muted"}>
                    {text ?? placeholder ?? "Select…"}
                </Text>
                <ChevronDown size={17} color={colors.mutedForeground} />
            </Pressable>
            {error ? (
                <Text variant="small" tone="destructive">
                    {error}
                </Text>
            ) : null}
        </View>
    );
}

function OptionSheet<V extends string>({
    open,
    onClose,
    title,
    options,
    searchable,
    isSelected,
    onPick,
    multi,
    onClear,
}: {
    open: boolean;
    onClose: () => void;
    title: string;
    options: Option<V>[];
    searchable: boolean;
    isSelected: (v: V) => boolean;
    onPick: (v: V) => void;
    multi?: boolean;
    onClear?: () => void;
}) {
    const { colors } = useTheme();
    const [query, setQuery] = useState("");
    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return q ? options.filter((o) => o.label.toLowerCase().includes(q) || o.description?.toLowerCase().includes(q)) : options;
    }, [options, query]);

    return (
        <Sheet open={open} onClose={onClose} title={title} scroll={false} maxHeight={0.8} fullHeight={options.length > 7}>
            {searchable ? <Input icon={Search} placeholder="Search…" value={query} onChangeText={setQuery} autoCorrect={false} /> : null}
            {onClear ? (
                <Pressable onPress={onClear} style={{ alignSelf: "flex-end" }}>
                    <Text variant="label" tone="primary">
                        Clear selection
                    </Text>
                </Pressable>
            ) : null}
            <FlatList
                data={filtered}
                keyExtractor={(o) => o.value}
                keyboardShouldPersistTaps="handled"
                style={{ flexGrow: 0 }}
                ListEmptyComponent={
                    <Text tone="muted" center style={{ paddingVertical: 24 }}>
                        No matches
                    </Text>
                }
                renderItem={({ item }) => {
                    const active = isSelected(item.value);
                    return (
                        <Pressable
                            disabled={item.disabled}
                            onPress={() => onPick(item.value)}
                            style={({ pressed }) => [
                                styles.option,
                                { backgroundColor: active ? colors.accent : pressed ? colors.secondary : "transparent", opacity: item.disabled ? 0.45 : 1 },
                            ]}
                        >
                            {item.left}
                            <View style={{ flex: 1 }}>
                                <Text variant="bodyMedium">{item.label}</Text>
                                {item.description ? (
                                    <Text variant="small" tone="muted" numberOfLines={1}>
                                        {item.description}
                                    </Text>
                                ) : null}
                            </View>
                            {active ? <Check size={18} color={colors.primaryInk} strokeWidth={2.4} /> : multi ? <View style={[styles.box, { borderColor: colors.input }]} /> : null}
                        </Pressable>
                    );
                }}
            />
        </Sheet>
    );
}

const styles = StyleSheet.create({
    field: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 50, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 14 },
    option: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 12, borderRadius: radius.sm },
    box: { width: 20, height: 20, borderRadius: 7, borderWidth: 1.5 },
});
