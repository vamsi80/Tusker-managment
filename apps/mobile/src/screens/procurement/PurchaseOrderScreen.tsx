import { useState } from "react";
import { StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { FileDown, Printer } from "lucide-react-native";
import { purchaseOrdersApi } from "../../api/procurement";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { qk } from "../../lib/query";
import { BUYER_COMPANIES, buyerLabel, rupeesInWords, type CompanyCode } from "../../lib/purchase-order";
import { poTotalRows, printPo, sharePoPdf, vendorAddressLines } from "../../lib/poDocument";
import { PO_STATUS_TONE } from "../../lib/constants";
import { fmtDate, formatPaise } from "../../lib/format";
import { toast } from "../../lib/toast";
import { useTheme } from "../../theme/ThemeProvider";
import { Badge, Card, CardHeader, ErrorState, KeyValue, ListSkeleton, Text } from "../../components/ui";
import { Button } from "../../components/ui/Button";
import { BottomBar, Screen, ScreenBody, ScreenHeader } from "../../components/layout/Screen";
import type { RootStackParamList } from "../../navigation/types";

/** procurement/pos/[poId] — the PO document, with PDF share and print. */
export function PurchaseOrderScreen({ route }: NativeStackScreenProps<RootStackParamList, "PurchaseOrder">) {
    const { poId } = route.params;
    const { colors } = useTheme();
    const { workspaceId } = useWorkspace();
    const [busy, setBusy] = useState<"pdf" | "print" | null>(null);
    const q = useQuery({ queryKey: qk.po(workspaceId, poId), queryFn: () => purchaseOrdersApi.get(workspaceId, poId), enabled: !!workspaceId });
    const po = q.data;

    const run = async (kind: "pdf" | "print") => {
        setBusy(kind);
        try {
            if (kind === "pdf") await sharePoPdf(po);
            else await printPo(po);
        } catch (e) {
            toast.fromError(e, "Couldn't create the PDF");
        } finally {
            setBusy(null);
        }
    };

    if (q.isError) {
        return (
            <Screen>
                <ScreenHeader title="Purchase Order" back showActions={false} />
                <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />
            </Screen>
        );
    }
    if (!po) {
        return (
            <Screen>
                <ScreenHeader title="Purchase Order" back showActions={false} />
                <View style={{ padding: 16 }}>
                    <ListSkeleton rows={5} avatar={false} />
                </View>
            </Screen>
        );
    }

    const buyer = BUYER_COMPANIES[po.company as CompanyCode];
    const totals = poTotalRows(po);

    return (
        <Screen>
            <ScreenHeader title={po.poNumber} subtitle={buyerLabel(po.company)} back showActions={false} />
            <ScreenBody
                refreshing={q.isRefetching}
                onRefresh={() => q.refetch()}
                footer={
                    <BottomBar>
                        <Button variant="outline" icon={Printer} title="Print" style={{ flex: 1 }} loading={busy === "print"} onPress={() => run("print")} />
                        <Button icon={FileDown} title="Download PDF" style={{ flex: 1.4 }} loading={busy === "pdf"} onPress={() => run("pdf")} />
                    </BottomBar>
                }
            >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Badge label={po.status} color={PO_STATUS_TONE[po.status]} />
                    <Text variant="small" tone="muted">
                        {fmtDate(po.poDate)} · {po.intraState ? "Intra-state (CGST + SGST)" : "Inter-state (IGST)"}
                    </Text>
                </View>

                <Card style={{ gap: 14 }}>
                    <View style={{ flexDirection: "row", gap: 14 }}>
                        <View style={{ flex: 1 }}>
                            <KeyValue label="PO No">{<Text variant="mono" weight="bold">{po.poNumber}</Text>}</KeyValue>
                        </View>
                        <View style={{ flex: 1 }}>
                            <KeyValue label="Reference No" value={po.referenceNo} />
                        </View>
                    </View>
                    <KeyValue label="Invoice To">
                        <Text variant="small">{[buyer.name, ...buyer.addressLines, `GST No: ${buyer.gstNumber}`].join("\n")}</Text>
                    </KeyValue>
                    <KeyValue label="Purchase From">
                        <Text variant="small">{[...vendorAddressLines(po.vendor), po.vendor.gstNumber ? `GSTIN: ${po.vendor.gstNumber}` : null].filter(Boolean).join("\n")}</Text>
                    </KeyValue>
                    <KeyValue label="Delivery Address">
                        <Text variant="small">{po.deliveryAddress}</Text>
                    </KeyValue>
                    {po.indent ? <KeyValue label="Indent" value={[po.indent.indentId, po.indent.name].filter(Boolean).join(" · ")} /> : null}
                </Card>

                <Card padded={false}>
                    <CardHeader title={`Items (${po.items.length})`} />
                    {po.items.map((it: any, i: number) => (
                        <View key={it.id} style={[styles.line, { borderTopColor: colors.border }]}>
                            <Text variant="caption" tone="muted" style={{ width: 20 }}>
                                {i + 1}
                            </Text>
                            <View style={{ flex: 1, gap: 2 }}>
                                <Text variant="bodyMedium">{it.description}</Text>
                                <Text variant="caption" tone="muted">
                                    {it.quantity} {it.unit} × {formatPaise(it.rate)} · GST {it.taxPercent}%
                                </Text>
                            </View>
                            <Text variant="mono" weight="semibold">
                                {formatPaise(it.amount ?? it.quantity * it.rate)}
                            </Text>
                        </View>
                    ))}
                    {totals.map((r) => (
                        <View key={r.label} style={[styles.total, { borderTopColor: colors.border, backgroundColor: r.bold ? colors.secondary : "transparent" }]}>
                            <Text variant={r.bold ? "label" : "small"} tone={r.bold ? "default" : "muted"}>
                                {r.label}
                            </Text>
                            <Text variant="mono" weight={r.bold ? "bold" : "medium"}>
                                {formatPaise(r.value)}
                            </Text>
                        </View>
                    ))}
                    <Text variant="small" style={{ padding: 14 }}>
                        <Text variant="small" weight="bold">
                            IN WORDS{"  "}
                        </Text>
                        {rupeesInWords(po.grandTotal)}
                    </Text>
                </Card>

                {po.terms?.length ? (
                    <Card padded={false}>
                        <CardHeader title="Payment Terms & Conditions" />
                        <View style={{ padding: 14, gap: 6 }}>
                            {po.terms.map((t: string, i: number) => (
                                <Text key={i} variant="small" tone="muted">
                                    {i + 1}. {t}
                                </Text>
                            ))}
                        </View>
                    </Card>
                ) : null}
                {po.notes ? <KeyValue label="Notes" value={po.notes} /> : null}
            </ScreenBody>
        </Screen>
    );
}

const styles = StyleSheet.create({
    line: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: 1 },
    total: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: 1 },
});
