import { useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Mail, Pencil, Phone, Plus, Trash2 } from "lucide-react-native";
import { vendorsApi } from "../../api/procurement";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { qk } from "../../lib/query";
import { SERVICE_TYPES, VENDOR_STATUS_TONE } from "../../lib/constants";
import { fmtDate, formatRate, toPaise, vendorDisplayName } from "../../lib/format";
import { toast } from "../../lib/toast";
import { useTheme } from "../../theme/ThemeProvider";
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Input, KeyValue, ListSkeleton, Select, Sheet, Tabs, Text, confirm } from "../../components/ui";
import { Screen, ScreenBody, ScreenHeader } from "../../components/layout/Screen";
import type { RootStackParamList } from "../../navigation/types";

/** vendors/[vendorId] — profile (vendor-profile-info) and materials (vendor-materials). */
export function VendorDetailScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, "VendorDetail">) {
    const { vendorId } = route.params;
    const { colors } = useTheme();
    const { workspaceId, isAdmin } = useWorkspace();
    const [tab, setTab] = useState<"profile" | "materials">("profile");
    const q = useQuery({ queryKey: qk.vendor(workspaceId, vendorId), queryFn: () => vendorsApi.get(workspaceId, vendorId), enabled: !!workspaceId });
    const v = q.data;

    if (q.isError) {
        return (
            <Screen>
                <ScreenHeader title="Supplier / Contractor" back showActions={false} />
                <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />
            </Screen>
        );
    }

    return (
        <Screen>
            <ScreenHeader
                title={v ? vendorDisplayName(v) : "Supplier / Contractor"}
                subtitle={v?.vendorId}
                back
                showActions={false}
                right={
                    isAdmin && v ? (
                        <Pressable hitSlop={8} onPress={() => navigation.navigate("VendorForm", { vendorId })} style={{ padding: 8 }}>
                            <Pencil size={18} color={colors.foreground} />
                        </Pressable>
                    ) : null
                }
            />
            {!v ? (
                <View style={{ padding: 16 }}>
                    <ListSkeleton rows={6} avatar={false} />
                </View>
            ) : (
                <>
                    <View style={{ paddingHorizontal: 16, paddingTop: 12, gap: 10 }}>
                        <View style={{ flexDirection: "row", gap: 8 }}>
                            <Badge label={v.status} color={VENDOR_STATUS_TONE[v.status]} />
                            <Badge label={(v.vendorType ?? "SUPPLIER").toLowerCase()} variant="muted" />
                        </View>
                        <Tabs scrollable={false} value={tab} onChange={setTab} items={[{ key: "profile", label: "Profile" }, { key: "materials", label: "Materials & Rates" }]} />
                    </View>
                    {tab === "profile" ? <Profile v={v} /> : <Materials vendorId={vendorId} />}
                </>
            )}
        </Screen>
    );
}

function Profile({ v }: { v: any }) {
    const hasGst = !!v.hasGst || !!v.gstNumber;
    const grid = (rows: [string, any][]) => (
        <View style={styles.grid}>
            {rows.map(([label, value]) => (
                <View key={label} style={styles.cell}>
                    <KeyValue label={label} value={value} />
                </View>
            ))}
        </View>
    );
    return (
        <ScreenBody>
            {v.phoneNumber || v.email ? (
                <View style={{ flexDirection: "row", gap: 8 }}>
                    {v.phoneNumber ? <Button variant="outline" icon={Phone} title="Call" style={{ flex: 1 }} onPress={() => Linking.openURL(`tel:${v.phoneNumber}`)} /> : null}
                    {v.email ? <Button variant="outline" icon={Mail} title="Email" style={{ flex: 1 }} onPress={() => Linking.openURL(`mailto:${v.email}`)} /> : null}
                </View>
            ) : null}
            <Card padded={false}>
                <CardHeader title="Business" />
                {grid([
                    ["Company Legal Name", v.companyName],
                    ["Contact Person", v.contactPerson],
                    ["Phone Number", v.phoneNumber],
                    ["Email Address", v.email],
                    ["Has GST Registration", hasGst ? "Yes" : "No"],
                    ["GSTIN / Tax ID", v.gstNumber],
                ])}
            </Card>
            {hasGst ? (
                <Card padded={false}>
                    <CardHeader title="GST Registry" />
                    {grid([
                        ["GST Status", v.gstStatus],
                        ["Taxpayer Type", v.taxpayerType],
                        ["Business Constitution", v.businessConstitution],
                        ["Registration Date", v.gstRegistrationDate],
                        ["Cancellation Date", v.gstCancellationDate],
                        ["State Jurisdiction", v.stateJurisdiction],
                        ["Nature of Business", v.natureOfBusiness],
                        ["E-Way Bill Block Status", v.blockStatus],
                        ["E-Invoice Enabled", v.einvoiceStatus],
                    ])}
                </Card>
            ) : null}
            <Card padded={false}>
                <CardHeader title="Address" />
                {grid([
                    ["Address Line 1", v.addressLine1 || v.address],
                    ["Address Line 2", v.addressLine2],
                    ["City / Town", v.city],
                    ["State / Province", v.state],
                    ["PIN / ZIP Code", v.pincode],
                    ["Country", v.country],
                ])}
            </Card>
        </ScreenBody>
    );
}

function Materials({ vendorId }: { vendorId: string }) {
    const { colors } = useTheme();
    const qc = useQueryClient();
    const { workspaceId, isAdmin, role } = useWorkspace();
    const canManage = isAdmin || role === "PROCUREMENT";
    const [editor, setEditor] = useState<any | null | undefined>(undefined);
    const q = useQuery({ queryKey: qk.vendorMaterials(workspaceId, vendorId), queryFn: () => vendorsApi.materials(workspaceId, vendorId) });
    const remove = useMutation({
        mutationFn: (capId: string) => vendorsApi.removeCapability(workspaceId, vendorId, capId),
        onSuccess: () => {
            toast.success("Material removed");
            q.refetch();
        },
        onError: (e) => toast.fromError(e),
    });

    return (
        <ScreenBody refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
            {canManage ? <Button icon={Plus} variant="outline" title="Add material & rate" onPress={() => setEditor(null)} /> : null}
            {q.isLoading ? <ListSkeleton rows={4} avatar={false} /> : null}
            {!q.isLoading && !(q.data ?? []).length ? <EmptyState title="No materials yet" description="Approved indents awarded to this supplier and rates you add appear here." compact /> : null}
            {(q.data ?? []).map((m: any) => (
                <Card key={`${m.kind}-${m.id}`} style={{ gap: 6 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Text variant="title" style={{ flex: 1 }}>
                            {m.materialName}
                        </Text>
                        <Text variant="mono" weight="bold">
                            {formatRate(m.rate)}
                            {m.unit ? <Text variant="caption" tone="muted"> / {m.unit}</Text> : null}
                        </Text>
                    </View>
                    <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                        <Badge size="xs" variant="muted" label={m.kind === "INDENT" ? "From indent" : SERVICE_TYPES.find((s) => s.value === m.serviceType)?.label ?? "Manual"} />
                        {m.quantity ? (
                            <Text variant="caption" tone="muted">
                                Qty {m.quantity}
                            </Text>
                        ) : null}
                        {m.indentRef ? (
                            <Text variant="caption" tone="muted">
                                {m.indentRef} · {m.projectName ?? m.indentName}
                            </Text>
                        ) : null}
                        {m.date ? (
                            <Text variant="caption" tone="muted">
                                {fmtDate(m.date)}
                            </Text>
                        ) : null}
                    </View>
                    {m.kind === "CAPABILITY" && (m.link || canManage) ? (
                        <View style={{ flexDirection: "row", gap: 8 }}>
                            {m.link ? <Button size="sm" variant="ghost" icon={ExternalLink} title="Open link" onPress={() => Linking.openURL(m.link)} /> : null}
                            <View style={{ flex: 1 }} />
                            {canManage ? (
                                <>
                                    <Button size="iconSm" variant="ghost" icon={Pencil} onPress={() => setEditor(m)} />
                                    <Button
                                        size="iconSm"
                                        variant="ghost"
                                        icon={Trash2}
                                        onPress={async () => {
                                            if (await confirm({ title: `Remove ${m.materialName}?`, confirmLabel: "Remove", destructive: true })) remove.mutate(m.id);
                                        }}
                                    />
                                </>
                            ) : null}
                        </View>
                    ) : null}
                </Card>
            ))}
            {editor !== undefined ? (
                <CapabilitySheet
                    vendorId={vendorId}
                    cap={editor}
                    onClose={() => setEditor(undefined)}
                    onSaved={() => {
                        q.refetch();
                        qc.invalidateQueries({ queryKey: qk.coverage(workspaceId) });
                    }}
                />
            ) : null}
        </ScreenBody>
    );
}

function CapabilitySheet({ vendorId, cap, onClose, onSaved }: { vendorId: string; cap: any | null; onClose: () => void; onSaved: () => void }) {
    const { workspaceId } = useWorkspace();
    const [name, setName] = useState(cap?.materialName ?? "");
    const [unit, setUnit] = useState(cap?.unit ?? "");
    const [serviceType, setServiceType] = useState<string>(cap?.serviceType ?? "SUPPLY");
    const [rate, setRate] = useState(cap?.rate ? String(cap.rate / 100) : "");
    const [quantity, setQuantity] = useState(cap?.quantity ? String(cap.quantity) : "");
    const [link, setLink] = useState(cap?.link ?? "");
    const save = useMutation({
        mutationFn: () => {
            if (!name.trim()) throw new Error("Material name is required");
            if (link.trim() && !/^https?:\/\//i.test(link.trim())) throw new Error("Link must start with http:// or https://");
            const body = {
                materialName: name.trim(),
                unit: unit.trim() || undefined,
                serviceType,
                rate: rate ? toPaise(rate) || null : null,
                quantity: Number(quantity) > 0 ? Math.round(Number(quantity)) : null,
                link: link.trim() || null,
            };
            return cap ? vendorsApi.updateCapability(workspaceId, vendorId, cap.id, body) : vendorsApi.addCapability(workspaceId, vendorId, body);
        },
        onSuccess: () => {
            toast.success(cap ? "Material updated" : "Material added");
            onSaved();
            onClose();
        },
        onError: (e) => toast.fromError(e),
    });
    return (
        <Sheet
            open
            onClose={onClose}
            title={cap ? "Edit material" : "Add material & rate"}
            footer={
                <>
                    <Button title="Cancel" variant="outline" style={{ flex: 1 }} onPress={onClose} />
                    <Button title="Save" style={{ flex: 1 }} loading={save.isPending} onPress={() => save.mutate()} />
                </>
            }
        >
            <Input label="Material" required value={name} onChangeText={setName} />
            <View style={{ flexDirection: "row", gap: 8 }}>
                <Input label="Unit" containerStyle={{ flex: 1 }} value={unit} onChangeText={setUnit} placeholder="e.g. kg" />
                <View style={{ flex: 1.3 }}>
                    <Select label="Service" value={serviceType} onChange={(v) => v && setServiceType(v)} options={SERVICE_TYPES.map((s) => ({ value: s.value, label: s.label }))} />
                </View>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
                <Input label="Agreed rate (₹)" containerStyle={{ flex: 1 }} keyboardType="decimal-pad" value={rate} onChangeText={setRate} />
                <Input label="Quantity" containerStyle={{ flex: 1 }} keyboardType="number-pad" value={quantity} onChangeText={setQuantity} />
            </View>
            <Input label="Link" autoCapitalize="none" keyboardType="url" placeholder="https://…" value={link} onChangeText={setLink} />
        </Sheet>
    );
}

const styles = StyleSheet.create({
    grid: { flexDirection: "row", flexWrap: "wrap", padding: 8 },
    cell: { width: "50%", padding: 8 },
});
