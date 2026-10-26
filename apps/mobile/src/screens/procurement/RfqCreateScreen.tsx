import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays } from "date-fns";
import { Download, Plus, X } from "lucide-react-native";
import { indentsApi, rfqApi, vendorsApi } from "../../api/procurement";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { qk } from "../../lib/query";
import { vendorDisplayName } from "../../lib/format";
import { toast } from "../../lib/toast";
import { useTheme } from "../../theme/ThemeProvider";
import { fonts, radius } from "../../theme/tokens";
import { Button, Card, CardHeader, DateField, EmptyState, Input, Select, Text } from "../../components/ui";
import { BottomBar, Screen, ScreenBody, ScreenHeader } from "../../components/layout/Screen";
import type { RootStackParamList } from "../../navigation/types";

const COLS = 4;

/** rfqs/create — "RFQ Comparison Sheet": materials × supplier columns with rates. */
export function RfqCreateScreen({ navigation }: NativeStackScreenProps<RootStackParamList, "RfqCreate">) {
    const { colors } = useTheme();
    const qc = useQueryClient();
    const { workspaceId } = useWorkspace();
    const pending = useQuery({ queryKey: qk.lineItems(workspaceId, { status: ["PENDING"] }), queryFn: () => indentsApi.lineItems(workspaceId, { status: ["PENDING"] }) });
    const vendors = useQuery({ queryKey: qk.vendors(workspaceId, { status: "ACTIVE" }), queryFn: () => vendorsApi.list(workspaceId, { status: "ACTIVE" }) });

    const approvedItems = useMemo(() => (pending.data ?? []).filter((i: any) => i.indent?.status === "APPROVED"), [pending.data]);
    const indents = useMemo(() => {
        const map = new Map<string, any>();
        approvedItems.forEach((i: any) => map.set(i.indent.id, i.indent));
        return [...map.values()];
    }, [approvedItems]);

    const [rows, setRows] = useState<any[]>([]);
    const [vendorIds, setVendorIds] = useState<(string | null)[]>(Array(COLS).fill(null));
    const [rates, setRates] = useState<Record<string, string>>({});
    const [leadTimes, setLeadTimes] = useState<Record<string, string>>({});
    const [deadline, setDeadline] = useState<Date | null>(addDays(new Date(), 3));

    const available = approvedItems.filter((i: any) => !rows.some((r) => r.id === i.id));
    const active = vendorIds.filter(Boolean) as string[];
    const total = (vendorId: string) => rows.reduce((s, r) => s + (Number(rates[`${vendorId}_${r.id}`]) || 0) * Number(r.quantity), 0);
    const lowestTotal = Math.min(...active.map(total).filter((t) => t > 0));

    const send = useMutation({
        mutationFn: async () => {
            if (!rows.length) throw new Error("Please add at least one material item to compare");
            if (!active.length) throw new Error("Please select at least one supplier / contractor for comparison");
            if (!deadline) throw new Error("Please set a response deadline");
            for (const item of rows) {
                await rfqApi.send(workspaceId, { lineItemId: item.id, vendorIds: active, deadline: deadline.toISOString() }).catch((e) => {
                    throw new Error(`Failed to send RFQ for ${item.materialName}: ${e.message}`);
                });
                for (const vendorId of active) {
                    const unitPrice = Number(rates[`${vendorId}_${item.id}`]) || 0;
                    if (unitPrice > 0) {
                        await rfqApi
                            .submitQuote(workspaceId, { lineItemId: item.id, vendorId, unitPrice, quantity: Number(item.quantity), leadTimeDays: Number(leadTimes[vendorId]) || undefined })
                            .catch((e) => toast.error(`Failed to record quote for ${item.materialName}: ${e.message}`));
                    }
                }
            }
        },
        onSuccess: () => {
            toast.success("RFQs dispatched and quotes saved successfully!");
            qc.invalidateQueries({ queryKey: ["line-items", workspaceId] });
            navigation.goBack();
        },
        onError: (e) => toast.fromError(e),
    });

    const vendorOptions = (vendors.data ?? []).map((v: any) => ({ value: v.id, label: vendorDisplayName(v), description: v.vendorId }));

    return (
        <Screen>
            <ScreenHeader title="RFQ Comparison Sheet" back showActions={false} />
            <ScreenBody
                footer={
                    <BottomBar>
                        <Button title="Cancel" variant="outline" style={{ flex: 1 }} onPress={() => navigation.goBack()} />
                        <Button title="Send RFQs" style={{ flex: 1.4 }} loading={send.isPending} onPress={() => send.mutate()} />
                    </BottomBar>
                }
            >
                <Card padded={false}>
                    <CardHeader title="Materials" />
                    <View style={{ padding: 16, gap: 12 }}>
                        <Select
                            label="Import an approved indent"
                            value={null}
                            onChange={(id) => {
                                if (!id) return;
                                const items = approvedItems.filter((i: any) => i.indent.id === id);
                                setRows((cur) => [...cur.filter((r) => !items.some((n: any) => n.id === r.id)), ...items]);
                                toast.success(`Imported ${items.length} items`);
                            }}
                            options={indents.map((i) => ({ value: i.id, label: `${i.indentId ?? ""} ${i.name}`.trim(), description: i.project?.name }))}
                            placeholder={pending.isLoading ? "Loading…" : "Select an approved indent…"}
                            trigger={(open) => <Button icon={Download} variant="outline" title="Import approved indent" onPress={open} />}
                        />
                        <Select
                            value={null}
                            onChange={(id) => {
                                const item = approvedItems.find((i: any) => i.id === id);
                                if (item) setRows((cur) => [...cur, item]);
                            }}
                            options={available.map((i: any) => ({ value: i.id, label: i.materialName, description: `${i.quantity} ${i.unit} · ${i.indent.indentId ?? ""} · ${i.indent.project?.name ?? "General"}` }))}
                            searchable
                            title="Pending materials"
                            trigger={(open) => <Button icon={Plus} variant="ghost" title="Add a single material" onPress={open} />}
                        />
                        {rows.length === 0 ? <EmptyState title="No materials yet" description="Import an approved indent or add materials one by one." compact /> : null}
                    </View>
                </Card>

                <Card padded={false}>
                    <CardHeader title="Suppliers / Contractors" />
                    <View style={{ padding: 16, gap: 10 }}>
                        {vendorIds.map((id, col) => (
                            <View key={col} style={{ flexDirection: "row", gap: 8, alignItems: "flex-end" }}>
                                <View style={{ flex: 1 }}>
                                    <Select
                                        label={`Column ${col + 1}`}
                                        value={id}
                                        onChange={(v) => setVendorIds((c) => c.map((x, i) => (i === col ? v : x)))}
                                        options={vendorOptions.filter((o) => o.value === id || !vendorIds.includes(o.value))}
                                        searchable
                                        allowClear
                                        placeholder="Search suppliers / contractors…"
                                    />
                                </View>
                                {id ? (
                                    <Input containerStyle={{ width: 84 }} keyboardType="number-pad" placeholder="Days" value={leadTimes[id] ?? ""} onChangeText={(v) => setLeadTimes((c) => ({ ...c, [id]: v }))} />
                                ) : null}
                            </View>
                        ))}
                        <DateField label="Response deadline" value={deadline} onChange={setDeadline} minimumDate={new Date()} />
                    </View>
                </Card>

                {rows.length && active.length ? (
                    <Card padded={false}>
                        <CardHeader title="Rates (₹ per unit)" />
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                            <View>
                                <View style={[styles.tr, { backgroundColor: colors.secondary }]}>
                                    <Text style={[styles.th, styles.matCol, { color: colors.mutedForeground }]}>MATERIAL</Text>
                                    {active.map((v) => (
                                        <Text key={v} numberOfLines={1} style={[styles.th, styles.rateCol, { color: colors.mutedForeground }]}>
                                            {vendorDisplayName((vendors.data ?? []).find((x: any) => x.id === v))}
                                        </Text>
                                    ))}
                                </View>
                                {rows.map((r) => (
                                    <View key={r.id} style={[styles.tr, { borderTopColor: colors.border }]}>
                                        <View style={[styles.matCol, { flexDirection: "row", alignItems: "center", gap: 6 }]}>
                                            <Pressable hitSlop={6} onPress={() => setRows((c) => c.filter((x) => x.id !== r.id))}>
                                                <X size={14} color={colors.mutedForeground} />
                                            </Pressable>
                                            <View style={{ flex: 1 }}>
                                                <Text variant="small" weight="semibold" numberOfLines={2}>
                                                    {r.materialName}
                                                </Text>
                                                <Text variant="caption" tone="muted">
                                                    {r.quantity} {r.unit}
                                                </Text>
                                            </View>
                                        </View>
                                        {active.map((v) => (
                                            <TextInput
                                                key={v}
                                                keyboardType="decimal-pad"
                                                placeholder="0.00"
                                                placeholderTextColor={colors.mutedForeground}
                                                value={rates[`${v}_${r.id}`] ?? ""}
                                                onChangeText={(t) => setRates((c) => ({ ...c, [`${v}_${r.id}`]: t }))}
                                                style={[styles.rateCol, styles.rateInput, { color: colors.foreground, borderColor: colors.input, backgroundColor: colors.card }]}
                                            />
                                        ))}
                                    </View>
                                ))}
                                <View style={[styles.tr, { borderTopColor: colors.border, backgroundColor: colors.secondary }]}>
                                    <Text style={[styles.matCol, { fontFamily: fonts.bold, fontSize: 12, color: colors.foreground }]}>TOTAL</Text>
                                    {active.map((v) => {
                                        const t = total(v);
                                        const best = t > 0 && t === lowestTotal;
                                        return (
                                            <Text key={v} style={[styles.rateCol, { fontFamily: fonts.bold, fontSize: 12, textAlign: "right", color: best ? colors.success : colors.foreground }]}>
                                                ₹{t.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                                            </Text>
                                        );
                                    })}
                                </View>
                            </View>
                        </ScrollView>
                    </Card>
                ) : null}
            </ScreenBody>
        </Screen>
    );
}

const styles = StyleSheet.create({
    tr: { flexDirection: "row", alignItems: "center", paddingVertical: 8, paddingHorizontal: 12, gap: 8, borderTopWidth: 1, borderTopColor: "transparent" },
    th: { fontFamily: fonts.bold, fontSize: 10, letterSpacing: 0.4 },
    matCol: { width: 170 },
    rateCol: { width: 110 },
    rateInput: { height: 38, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 10, textAlign: "right", fontFamily: fonts.medium, fontSize: 13 },
});
