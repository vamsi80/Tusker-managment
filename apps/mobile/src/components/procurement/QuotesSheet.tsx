import { useState } from "react";
import { View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Plus, X } from "lucide-react-native";
import { rfqApi, vendorsApi } from "../../api/procurement";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { qk } from "../../lib/query";
import { QUOTE_STATUS_TONE } from "../../lib/constants";
import { fmtDate, vendorDisplayName } from "../../lib/format";
import { toast } from "../../lib/toast";
import { useTheme } from "../../theme/ThemeProvider";
import { Badge, Button, Card, EmptyState, Input, Select, Sheet, Text, prompt } from "../ui";

/**
 * Quotes for one line item (GET /procurement/rfq/items/:id/quotes): compare,
 * approve one (which rejects the rest), reject with a reason, or record a new one.
 */
export function QuotesSheet({ lineItem, onClose, onChanged }: { lineItem: any; onClose: () => void; onChanged?: () => void }) {
    const { colors } = useTheme();
    const qc = useQueryClient();
    const { workspaceId, role } = useWorkspace();
    const [adding, setAdding] = useState(false);
    const quotes = useQuery({ queryKey: qk.quotes(workspaceId, lineItem.id), queryFn: () => rfqApi.quotes(workspaceId, lineItem.id) });
    const canDecide = ["OWNER", "ADMIN", "MANAGER", "PROCUREMENT"].includes(role ?? "");
    const lowest = Math.min(...(quotes.data ?? []).map((q: any) => Number(q.unitPrice) || Infinity));

    const refresh = () => {
        quotes.refetch();
        qc.invalidateQueries({ queryKey: ["line-items", workspaceId] });
        onChanged?.();
    };
    const approve = useMutation({
        mutationFn: (id: string) => rfqApi.approveQuote(workspaceId, id),
        onSuccess: () => {
            toast.success("Quote approved");
            refresh();
        },
        onError: (e) => toast.fromError(e, "Failed to approve quote"),
    });
    const reject = useMutation({
        mutationFn: ({ id, reason }: { id: string; reason: string }) => rfqApi.rejectQuote(workspaceId, id, reason),
        onSuccess: () => {
            toast.success("Quote rejected");
            refresh();
        },
        onError: (e) => toast.fromError(e, "Failed to reject quote"),
    });

    return (
        <Sheet open onClose={onClose} title={lineItem.materialName} description={`${lineItem.quantity} ${lineItem.unit} · ${lineItem.indent?.indentId ?? ""}`}>
            {canDecide && role !== "ACCOUNTS" ? <Button icon={Plus} title="Record a quote" variant="outline" onPress={() => setAdding(true)} /> : null}
            {(quotes.data ?? []).length === 0 && !quotes.isLoading ? <EmptyState title="No quotes yet" compact /> : null}
            {(quotes.data ?? []).map((quote: any) => {
                const isLowest = Number(quote.unitPrice) === lowest;
                return (
                    <Card key={quote.id} elevated={false} style={{ gap: 8, borderColor: isLowest ? colors.success : colors.border }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                            <Text variant="title" style={{ flex: 1 }} numberOfLines={1}>
                                {vendorDisplayName(quote.vendor)}
                            </Text>
                            {isLowest ? <Badge label="Lowest" size="xs" color={colors.success} /> : null}
                            <Badge label={quote.status} size="xs" color={QUOTE_STATUS_TONE[quote.status]} />
                        </View>
                        <View style={{ flexDirection: "row", gap: 16 }}>
                            <Text variant="small">
                                ₹{Number(quote.unitPrice).toLocaleString("en-IN")} <Text tone="muted">/ {lineItem.unit}</Text>
                            </Text>
                            <Text variant="small" tone="muted">
                                Total ₹{(Number(quote.unitPrice) * Number(quote.quantity ?? lineItem.quantity)).toLocaleString("en-IN")}
                            </Text>
                        </View>
                        {quote.leadTimeDays || quote.validUntil || quote.notes ? (
                            <Text variant="caption" tone="muted">
                                {[quote.leadTimeDays ? `${quote.leadTimeDays} days lead time` : null, quote.validUntil ? `valid until ${fmtDate(quote.validUntil)}` : null, quote.notes].filter(Boolean).join(" · ")}
                            </Text>
                        ) : null}
                        {canDecide && (quote.status === "SUBMITTED" || quote.status === "UNDER_REVIEW") ? (
                            <View style={{ flexDirection: "row", gap: 8 }}>
                                <Button
                                    size="sm"
                                    variant="destructiveOutline"
                                    icon={X}
                                    title="Reject"
                                    style={{ flex: 1 }}
                                    onPress={async () => {
                                        const reason = await prompt({ title: "Reject this quote", placeholder: "Reason" });
                                        if (reason) reject.mutate({ id: quote.id, reason });
                                    }}
                                />
                                <Button size="sm" variant="success" icon={Check} title="Approve" style={{ flex: 1 }} loading={approve.isPending} onPress={() => approve.mutate(quote.id)} />
                            </View>
                        ) : null}
                    </Card>
                );
            })}
            {adding ? <AddQuoteSheet lineItem={lineItem} onClose={() => setAdding(false)} onSaved={refresh} /> : null}
        </Sheet>
    );
}

function AddQuoteSheet({ lineItem, onClose, onSaved }: { lineItem: any; onClose: () => void; onSaved: () => void }) {
    const { workspaceId } = useWorkspace();
    const vendors = useQuery({ queryKey: qk.vendors(workspaceId, { status: "ACTIVE" }), queryFn: () => vendorsApi.list(workspaceId, { status: "ACTIVE" }) });
    const [vendorId, setVendorId] = useState<string | null>(null);
    const [unitPrice, setUnitPrice] = useState("");
    const [leadTime, setLeadTime] = useState("");
    const [notes, setNotes] = useState("");
    const save = useMutation({
        mutationFn: () => {
            if (!vendorId) throw new Error("Select a supplier / contractor");
            if (!(Number(unitPrice) > 0)) throw new Error("Enter a valid rate");
            return rfqApi.submitQuote(workspaceId, {
                lineItemId: lineItem.id,
                vendorId,
                unitPrice: Number(unitPrice),
                quantity: Number(lineItem.quantity),
                leadTimeDays: Number(leadTime) > 0 ? Number(leadTime) : undefined,
                notes: notes.trim() || undefined,
            });
        },
        onSuccess: () => {
            toast.success("Quote recorded");
            onSaved();
            onClose();
        },
        onError: (e) => toast.fromError(e, "Failed to record quote"),
    });
    return (
        <Sheet
            open
            onClose={onClose}
            title="Record a quote"
            footer={
                <>
                    <Button title="Cancel" variant="outline" style={{ flex: 1 }} onPress={onClose} />
                    <Button title="Save" style={{ flex: 1 }} loading={save.isPending} onPress={() => save.mutate()} />
                </>
            }
        >
            <Select label="Supplier / Contractor" required value={vendorId} onChange={setVendorId} options={(vendors.data ?? []).map((v: any) => ({ value: v.id, label: vendorDisplayName(v), description: v.vendorId }))} searchable />
            <View style={{ flexDirection: "row", gap: 10 }}>
                <Input label={`Rate (₹ / ${lineItem.unit})`} required containerStyle={{ flex: 1 }} keyboardType="decimal-pad" value={unitPrice} onChangeText={setUnitPrice} placeholder="0.00" />
                <Input label="Lead time (days)" containerStyle={{ flex: 1 }} keyboardType="number-pad" value={leadTime} onChangeText={setLeadTime} placeholder="Days" />
            </View>
            <Input label="Notes" multiline value={notes} onChangeText={setNotes} placeholder="Add notes…" />
        </Sheet>
    );
}
