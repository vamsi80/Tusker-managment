import { View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Calendar, Package, User } from "lucide-react-native";
import { INDENT_STATUS_LABELS, INDENT_STATUS_TONE } from "../../lib/constants";
import { displayName, fmtDate, formatRate, vendorDisplayName } from "../../lib/format";
import { useTheme } from "../../theme/ThemeProvider";
import { Badge, Card, Text } from "../ui";

export function IndentStatusBadge({ status, size = "sm" }: { status: string; size?: "xs" | "sm" }) {
    return <Badge label={INDENT_STATUS_LABELS[status] ?? status} color={INDENT_STATUS_TONE[status] ?? "#94a3b8"} size={size} />;
}

/** A row of indents-client.tsx: ID, name, status, project, requester, delivery, totals. */
export function IndentCard({ indent }: { indent: any }) {
    const { colors } = useTheme();
    const navigation = useNavigation<any>();
    return (
        <Card onPress={() => navigation.navigate("IndentDetail", { indentId: indent.id })} style={{ gap: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text variant="mono" tone="muted">
                    {indent.indentId || "Draft"}
                </Text>
                <View style={{ flex: 1 }} />
                <IndentStatusBadge status={indent.status} size="xs" />
            </View>
            <Text variant="title" numberOfLines={2}>
                {indent.name}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
                <Meta icon={Package} text={indent.project?.name ?? "General indent"} />
                <Meta icon={User} text={displayName(indent.requestedBy?.user)} />
                {indent.expectedDelivery ? <Meta icon={Calendar} text={fmtDate(indent.expectedDelivery)} /> : null}
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 6, borderTopWidth: 0.5, borderTopColor: colors.border }}>
                <Text variant="caption" tone="muted">
                    {indent._count?.lineItems ?? indent.lineItems?.length ?? 0} materials
                </Text>
                {indent.selectedVendor ? (
                    <Text variant="caption" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
                        · {vendorDisplayName(indent.selectedVendor)}
                    </Text>
                ) : (
                    <View style={{ flex: 1 }} />
                )}
                <Text variant="mono" weight="semibold">
                    {indent.finalTotal != null ? formatRate(indent.finalTotal) : indent.estimatedTotal ? `~${formatRate(indent.estimatedTotal)}` : "—"}
                </Text>
            </View>
        </Card>
    );
}

function Meta({ icon: Icon, text }: { icon: any; text: string }) {
    const { colors } = useTheme();
    return (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, maxWidth: "100%" }}>
            <Icon size={12} color={colors.mutedForeground} />
            <Text variant="caption" tone="muted" numberOfLines={1}>
                {text}
            </Text>
        </View>
    );
}
