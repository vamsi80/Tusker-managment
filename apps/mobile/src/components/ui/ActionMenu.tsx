import type { ComponentType } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";
import { radius } from "../../theme/tokens";
import { Sheet } from "./Sheet";
import { Text } from "./Text";

export type MenuAction = {
    label: string;
    icon?: ComponentType<{ size?: number; color?: string }>;
    onPress: () => void;
    destructive?: boolean;
    disabled?: boolean;
    hidden?: boolean;
    description?: string;
};

/** The web's DropdownMenu, as a bottom sheet of actions. */
export function ActionMenu({ open, onClose, title, actions }: { open: boolean; onClose: () => void; title?: string; actions: MenuAction[] }) {
    const { colors } = useTheme();
    const visible = actions.filter((a) => !a.hidden);
    return (
        <Sheet open={open} onClose={onClose} title={title}>
            <View style={{ gap: 2 }}>
                {visible.map((action) => {
                    const Icon = action.icon;
                    const color = action.destructive ? colors.destructive : colors.foreground;
                    return (
                        <Pressable
                            key={action.label}
                            disabled={action.disabled}
                            onPress={() => {
                                onClose();
                                setTimeout(action.onPress, 220);
                            }}
                            style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.secondary : "transparent", opacity: action.disabled ? 0.45 : 1 }]}
                        >
                            {Icon ? (
                                <View style={[styles.icon, { backgroundColor: action.destructive ? colors.destructive + "16" : colors.secondary }]}>
                                    <Icon size={17} color={color} />
                                </View>
                            ) : null}
                            <View style={{ flex: 1 }}>
                                <Text variant="bodyMedium" color={color}>
                                    {action.label}
                                </Text>
                                {action.description ? (
                                    <Text variant="small" tone="muted">
                                        {action.description}
                                    </Text>
                                ) : null}
                            </View>
                        </Pressable>
                    );
                })}
            </View>
        </Sheet>
    );
}

const styles = StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 8, paddingVertical: 11, borderRadius: radius.md },
    icon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
});
