import { StyleSheet, View } from "react-native";
import { Tag as TagIcon } from "lucide-react-native";
import { useTheme } from "../../theme/ThemeProvider";
import { fonts } from "../../theme/tokens";
import { delayColor, delayText, remainingDays } from "../../lib/delay";
import { Avatar, Text, tint } from "../ui";

/** The deadline pill on kanban cards and list rows. */
export function DelayPill({ dueDate, status }: { dueDate?: string | null; status?: string | null }) {
    const days = remainingDays(dueDate);
    const { color, ring } = delayColor(days, status);
    return (
        <View style={[styles.delay, { borderColor: tint(color, 0.3), backgroundColor: tint(color, 0.08) }]}>
            <View style={[styles.dot, ring ? { borderWidth: 1.5, borderColor: color, backgroundColor: "transparent" } : { backgroundColor: color }]} />
            <Text style={{ fontFamily: fonts.medium, fontSize: 10.5, color }} numberOfLines={1}>
                {delayText(days, status)}
            </Text>
        </View>
    );
}

const titleCase = (s: string) => s.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

export function TagChips({ tags, max = 1 }: { tags?: { id: string; name: string }[]; max?: number }) {
    const { colors } = useTheme();
    if (!tags?.length) return null;
    return (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            {tags.slice(0, max).map((tag) => (
                <View key={tag.id} style={[styles.tag, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                    <TagIcon size={10} color={colors.mutedForeground} />
                    <Text style={{ fontFamily: fonts.medium, fontSize: 10, color: colors.mutedForeground, maxWidth: 90 }} numberOfLines={1}>
                        {titleCase(tag.name)}
                    </Text>
                </View>
            ))}
            {tags.length > max ? (
                <View style={[styles.more, { backgroundColor: tint(colors.primary, 0.12), borderColor: tint(colors.primary, 0.3) }]}>
                    <Text style={{ fontFamily: fonts.bold, fontSize: 9, color: colors.foreground }}>+{tags.length - max}</Text>
                </View>
            ) : null}
        </View>
    );
}

export function AssigneeAvatar({ user, size = 24 }: { user?: { surname?: string | null; name?: string | null; image?: string | null } | null; size?: number }) {
    const { colors } = useTheme();
    if (!user) {
        return (
            <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 1, borderStyle: "dashed", borderColor: colors.mutedForeground, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: size * 0.4, color: colors.mutedForeground }}>?</Text>
            </View>
        );
    }
    return <Avatar name={user.surname || user.name} image={user.image} size={size} />;
}

const styles = StyleSheet.create({
    delay: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, borderWidth: 1, maxWidth: 110 },
    dot: { width: 7, height: 7, borderRadius: 4 },
    tag: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, borderWidth: 1 },
    more: { paddingHorizontal: 4, paddingVertical: 2, borderRadius: 5, borderWidth: 1 },
});
