import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react-native";
import { indentsApi, purchaseOrdersApi, vendorsApi } from "../../api/procurement";
import { useAuth } from "../../providers/AuthProvider";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { qk } from "../../lib/query";
import { BUYER_COMPANIES, PO_TERMS, buyerLabel, canCreatePurchaseOrder, companyAddress, isIntraState, poTotals, type CompanyCode } from "../../lib/purchase-order";
import { formatPaise, vendorDisplayName } from "../../lib/format";
import { toast } from "../../lib/toast";
import { useTheme } from "../../theme/ThemeProvider";
import { Banner, Button, Card, CardHeader, DateField, EmptyState, Input, Select, Tabs, Text } from "../../components/ui";
import { BottomBar, Screen, ScreenBody, ScreenHeader } from "../../components/layout/Screen";
import type { RootStackParamList } from "../../navigation/types";

type Row = { description: string; unit: string; quantity: string; rate: string; taxPercent: string };
const blank = (): Row => ({ description: "", unit: "Nos", quantity: "1", rate: "", taxPercent: "18" });
const toPaise = (rupees: string) => Math.round(Number(rupees || 0) * 100);

/** procurement/pos/new/_form.tsx — raise a GST purchase order from an approved indent. */
export function PurchaseOrderFormScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, "PurchaseOrderForm">) {
    const { colors } = useTheme();
    const qc = useQueryClient();
    const auth = useAuth();
    const { workspaceId, role } = useWorkspace();
    const allowed = canCreatePurchaseOrder(auth.status === "signedIn" ? auth.user.email : null, role);

    const [company, setCompany] = useState<CompanyCode>("WT");
    const [poDate, setPoDate] = useState<Date>(new Date());
    const [referenceNo, setReferenceNo] = useState("");
    const [deliveryAddress, setDeliveryAddress] = useState(companyAddress("WT"));
    const [addressTouched, setAddressTouched] = useState(false);
    const [vendorId, setVendorId] = useState<string | null>(null);
    const [indentId, setIndentId] = useState<string | null>(route.params?.indentId ?? null);
    const [terms, setTerms] = useState(PO_TERMS.join("\n"));
    const [notes, setNotes] = useState("");
    const [excise, setExcise] = useState("");
    const [vat, setVat] = useState("");
    const [transport, setTransport] = useState("");
    const [labour, setLabour] = useState("");
    const [rows, setRows] = useState<Row[]>([blank()]);

    const vendors = useQuery({ queryKey: qk.vendors(workspaceId, { status: "ACTIVE" }), queryFn: () => vendorsApi.list(workspaceId, { status: "ACTIVE" }) });
    const indents = useQuery({ queryKey: qk.indents(workspaceId), queryFn: () => indentsApi.list(workspaceId) });
    const approved = (indents.data ?? []).filter((i) => i.status === "APPROVED");

    /** Pull the approved items and rates straight off the indent. */
    const loadIndent = async (id: string | null) => {
        setIndentId(id);
        if (!id) return;
        try {
            const data = await indentsApi.get(workspaceId, id);
            setRows(
                (data.lineItems ?? []).map((item: any) => ({
                    description: [item.materialName, item.specifications].filter(Boolean).join(" - "),
                    unit: item.unit ?? "Nos",
                    quantity: String(item.quantity ?? 1),
                    rate: ((item.finalUnitPrice ?? item.estimatedUnitPrice ?? 0) / 100).toFixed(2),
                    taxPercent: "18",
                })),
            );
            const pct = (v: unknown) => (Number(v) > 0 ? String(Number(v)) : "");
            const rupees = (p: unknown) => (Number(p) > 0 ? (Number(p) / 100).toFixed(2) : "");
            setExcise(pct(data.exciseDutyPercent));
            setVat(pct(data.vatPercent));
            setTransport(rupees(data.transportCharge));
            setLabour(rupees(data.labourCharge));
            const vendor = data.selectedVendorId ?? data.lineItems?.[0]?.approvedQuote?.vendorId ?? "";
            if (vendor) setVendorId(vendor);
            if (data.indentId) setReferenceNo((c) => c || data.indentId);
        } catch {
            toast.error("Could not load that indent");
        }
    };

    const hydrated = useRef(false);
    useEffect(() => {
        if (hydrated.current || !route.params?.indentId || !workspaceId) return;
        hydrated.current = true;
        loadIndent(route.params.indentId);
    }, [route.params?.indentId, workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

    const vendor = (vendors.data ?? []).find((v: any) => v.id === vendorId);
    const buyer = BUYER_COMPANIES[company];
    const totals = useMemo(
        () =>
            poTotals(
                rows.map((r) => ({ quantity: Number(r.quantity || 0), rate: toPaise(r.rate), taxPercent: Number(r.taxPercent || 0) })),
                isIntraState(buyer.gstNumber, vendor?.gstNumber),
                { exciseDutyPercent: Number(excise) || null, vatPercent: Number(vat) || null, transportCharge: toPaise(transport) || null, labourCharge: toPaise(labour) || null },
            ),
        [rows, buyer.gstNumber, vendor?.gstNumber, excise, vat, transport, labour],
    );

    const setRow = (i: number, patch: Partial<Row>) => setRows((c) => c.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

    const save = useMutation({
        mutationFn: () => {
            const items = rows
                .filter((r) => r.description.trim())
                .map((r) => ({ description: r.description.trim(), unit: r.unit.trim() || "Nos", quantity: Number(r.quantity || 0), rate: toPaise(r.rate), taxPercent: Number(r.taxPercent || 0) }));
            if (!vendorId) throw new Error("Select a vendor");
            if (!indentId) throw new Error("Select an approved indent");
            if (!deliveryAddress.trim()) throw new Error("Enter a delivery address");
            if (!items.length) throw new Error("Add at least one line item");
            if (items.some((i) => !Number.isInteger(i.quantity) || i.quantity <= 0)) throw new Error("Quantities must be whole numbers above zero");
            return purchaseOrdersApi.create({
                workspaceId,
                company,
                vendorId,
                indentId,
                referenceNo: referenceNo.trim() || null,
                poDate: poDate.toISOString(),
                deliveryAddress: deliveryAddress.trim(),
                exciseDutyPercent: Number(excise) || null,
                vatPercent: Number(vat) || null,
                transportCharge: toPaise(transport) || null,
                labourCharge: toPaise(labour) || null,
                terms: terms.split("\n").map((t) => t.trim()).filter(Boolean),
                notes: notes.trim() || null,
                items,
            });
        },
        onSuccess: (po) => {
            toast.success(`Purchase order ${po.poNumber} raised`);
            qc.invalidateQueries({ queryKey: qk.pos(workspaceId) });
            qc.invalidateQueries({ queryKey: ["indent", workspaceId] });
            navigation.goBack();
            navigation.navigate("PurchaseOrder", { poId: po.id });
        },
        onError: (e) => toast.fromError(e, "Failed to raise purchase order"),
    });

    if (!allowed) {
        return (
            <Screen>
                <ScreenHeader title="New Purchase Order" back showActions={false} />
                <EmptyState title="Purchase orders are raised by Accounts" description="Only the accounts login or a workspace owner may raise purchase orders." />
            </Screen>
        );
    }

    return (
        <Screen>
            <ScreenHeader title="New Purchase Order" back showActions={false} />
            <ScreenBody
                footer={
                    <BottomBar>
                        <View style={{ flex: 1 }}>
                            <Text variant="caption" tone="muted">
                                Grand total
                            </Text>
                            <Text variant="title">{formatPaise(totals.grandTotal)}</Text>
                        </View>
                        <Button title="Raise PO" style={{ flex: 1 }} loading={save.isPending} onPress={() => save.mutate()} />
                    </BottomBar>
                }
            >
                <Card padded={false}>
                    <CardHeader title="Buying Entity" />
                    <View style={{ padding: 16, gap: 12 }}>
                        <Tabs
                            scrollable={false}
                            value={company}
                            onChange={(c) => {
                                setCompany(c);
                                if (!addressTouched) setDeliveryAddress(companyAddress(c));
                            }}
                            items={(["WT", "PL"] as CompanyCode[]).map((c) => ({ key: c, label: buyerLabel(c) }))}
                        />
                        <Text variant="caption" tone="muted">
                            {buyer.name} · GST {buyer.gstNumber}
                        </Text>
                    </View>
                </Card>

                <Card padded={false}>
                    <CardHeader title="Order Details" />
                    <View style={{ padding: 16, gap: 12 }}>
                        <Select
                            label="Approved indent"
                            required
                            value={indentId}
                            onChange={loadIndent}
                            options={approved.map((i) => ({ value: i.id, label: `${i.indentId ? `${i.indentId} - ` : ""}${i.name}`, description: i.project?.name ?? "General" }))}
                            searchable
                            placeholder="Select an approved indent"
                        />
                        <Select label="Vendor" required value={vendorId} onChange={setVendorId} options={(vendors.data ?? []).map((v: any) => ({ value: v.id, label: vendorDisplayName(v), description: v.gstNumber ?? v.vendorId }))} searchable placeholder="Select a supplier / contractor" />
                        {vendor && !isIntraState(buyer.gstNumber, vendor.gstNumber) ? <Banner tone="info">Different state — IGST applies instead of CGST + SGST.</Banner> : null}
                        <View style={{ flexDirection: "row", gap: 10 }}>
                            <View style={{ flex: 1 }}>
                                <DateField label="PO Date" value={poDate} onChange={(d) => d && setPoDate(d)} />
                            </View>
                            <Input label="Reference No" containerStyle={{ flex: 1 }} value={referenceNo} onChangeText={setReferenceNo} />
                        </View>
                        <Input
                            label="Delivery Address"
                            required
                            multiline
                            value={deliveryAddress}
                            onChangeText={(v) => {
                                setAddressTouched(true);
                                setDeliveryAddress(v);
                            }}
                        />
                    </View>
                </Card>

                <Card padded={false}>
                    <CardHeader title="Line Items" />
                    {rows.map((row, i) => (
                        <View key={i} style={[styles.row, { borderTopColor: colors.border }]}>
                            <View style={{ flexDirection: "row", alignItems: "center" }}>
                                <Text variant="label" tone="muted" style={{ flex: 1 }}>
                                    Item {i + 1} · {formatPaise(totals.lines[i]?.amount ?? 0)}
                                </Text>
                                <Pressable hitSlop={8} onPress={() => setRows((c) => (c.length === 1 ? [blank()] : c.filter((_, idx) => idx !== i)))}>
                                    <Trash2 size={16} color={colors.destructive} />
                                </Pressable>
                            </View>
                            <Input placeholder="Description" value={row.description} onChangeText={(v) => setRow(i, { description: v })} />
                            <View style={{ flexDirection: "row", gap: 8 }}>
                                <Input label="Qty" containerStyle={{ flex: 0.8 }} keyboardType="number-pad" value={row.quantity} onChangeText={(v) => setRow(i, { quantity: v })} />
                                <Input label="Unit" containerStyle={{ flex: 0.8 }} value={row.unit} onChangeText={(v) => setRow(i, { unit: v })} />
                                <Input label="Rate (₹)" containerStyle={{ flex: 1 }} keyboardType="decimal-pad" value={row.rate} onChangeText={(v) => setRow(i, { rate: v })} />
                                <Input label="GST %" containerStyle={{ flex: 0.7 }} keyboardType="number-pad" value={row.taxPercent} onChangeText={(v) => setRow(i, { taxPercent: v })} />
                            </View>
                        </View>
                    ))}
                    <Pressable onPress={() => setRows((c) => [...c, blank()])} style={[styles.add, { borderTopColor: colors.border }]}>
                        <Plus size={16} color={colors.primaryInk} />
                        <Text variant="label" tone="primary">
                            Add line
                        </Text>
                    </Pressable>
                </Card>

                <Card padded={false}>
                    <CardHeader title="Charges & Totals" />
                    <View style={{ padding: 16, gap: 10 }}>
                        <View style={{ flexDirection: "row", gap: 8 }}>
                            <Input label="Excise (%)" containerStyle={{ flex: 1 }} keyboardType="decimal-pad" value={excise} onChangeText={setExcise} />
                            <Input label="VAT (%)" containerStyle={{ flex: 1 }} keyboardType="decimal-pad" value={vat} onChangeText={setVat} />
                        </View>
                        <View style={{ flexDirection: "row", gap: 8 }}>
                            <Input label="Transportation (₹)" containerStyle={{ flex: 1 }} keyboardType="decimal-pad" value={transport} onChangeText={setTransport} />
                            <Input label="Labour (₹)" containerStyle={{ flex: 1 }} keyboardType="decimal-pad" value={labour} onChangeText={setLabour} />
                        </View>
                        <TotalRow label="Sub total" value={totals.subtotal} />
                        {totals.chargeRows.map((r) => (
                            <TotalRow key={r.label} label={r.label} value={r.value} />
                        ))}
                        {totals.taxRows.flatMap((r) =>
                            totals.igst
                                ? [<TotalRow key={`i${r.percent}`} label={`IGST @ ${r.percent}%`} value={r.amount} />]
                                : [<TotalRow key={`c${r.percent}`} label={`CGST @ ${r.percent / 2}%`} value={r.half} />, <TotalRow key={`s${r.percent}`} label={`SGST @ ${r.percent / 2}%`} value={r.half} />],
                        )}
                        {totals.roundOff !== 0 ? <TotalRow label="Round off" value={totals.roundOff} /> : null}
                        <TotalRow label="Grand total" value={totals.grandTotal} bold />
                    </View>
                </Card>

                <Input label="Terms (one per line)" multiline value={terms} onChangeText={setTerms} />
                <Input label="Notes" multiline value={notes} onChangeText={setNotes} placeholder="Optional" />
            </ScreenBody>
        </Screen>
    );
}

function TotalRow({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
    return (
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text variant={bold ? "label" : "small"} tone={bold ? "default" : "muted"}>
                {label}
            </Text>
            <Text variant="mono" weight={bold ? "bold" : "medium"}>
                {formatPaise(value)}
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    row: { padding: 14, gap: 10, borderTopWidth: 1 },
    add: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14, borderTopWidth: 1 },
});
