import { useEffect, useState } from "react";
import { View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Lock, ShieldCheck } from "lucide-react-native";
import { vendorsApi, type VendorInput } from "../../api/procurement";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { qk } from "../../lib/query";
import { getGstDetailsFromGstin, getVendorFieldsFromGstin, normalizeGstin, validateGstin, type GstinLookupData } from "../../lib/gstin";
import { toast } from "../../lib/toast";
import { useTheme } from "../../theme/ThemeProvider";
import { Banner, Card, CardHeader, Input, ListSkeleton, SwitchRow, Tabs, Text } from "../../components/ui";
import { Button } from "../../components/ui/Button";
import { BottomBar, Screen, ScreenBody, ScreenHeader } from "../../components/layout/Screen";
import type { RootStackParamList } from "../../navigation/types";

const GST_FIELDS: { key: keyof VendorInput; label: string; placeholder?: string }[] = [
    { key: "gstStatus", label: "GST Status", placeholder: "e.g. Active" },
    { key: "taxpayerType", label: "Taxpayer Type", placeholder: "e.g. Regular" },
    { key: "businessConstitution", label: "Business Constitution", placeholder: "e.g. Private Limited Company" },
    { key: "gstRegistrationDate", label: "Registration Date", placeholder: "dd/mm/yyyy" },
    { key: "gstCancellationDate", label: "Cancellation Date", placeholder: "dd/mm/yyyy" },
    { key: "stateJurisdiction", label: "State Jurisdiction", placeholder: "e.g. Ward 401" },
    { key: "natureOfBusiness", label: "Nature of Business", placeholder: "e.g. Wholesale Business" },
    { key: "blockStatus", label: "E-Way Bill Block Status", placeholder: "e.g. Unblocked" },
    { key: "einvoiceStatus", label: "E-Invoice Enabled", placeholder: "e.g. Yes" },
];

/** vendors/new and vendors/[vendorId]/edit — with GSTIN verification from the registry. */
export function VendorFormScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, "VendorForm">) {
    const vendorId = route.params?.vendorId;
    const { colors } = useTheme();
    const qc = useQueryClient();
    const { workspaceId } = useWorkspace();
    const existing = useQuery({ queryKey: qk.vendor(workspaceId, vendorId ?? ""), queryFn: () => vendorsApi.get(workspaceId, vendorId!), enabled: !!vendorId });

    const [vendorType, setVendorType] = useState<"SUPPLIER" | "CONTRACTOR">("SUPPLIER");
    const [form, setForm] = useState<VendorInput>({ country: "India" });
    const [hasGst, setHasGst] = useState(false);
    const [verified, setVerified] = useState<GstinLookupData | null>(null);
    const [gstError, setGstError] = useState<string | null>(null);
    const set = (patch: Partial<VendorInput>) => setForm((f) => ({ ...f, ...patch }));

    useEffect(() => {
        const v = existing.data;
        if (!v) return;
        setVendorType(v.vendorType ?? "SUPPLIER");
        setHasGst(!!v.hasGst || !!v.gstNumber);
        setForm({
            name: v.name, companyName: v.companyName, contactPerson: v.contactPerson, phoneNumber: v.phoneNumber, email: v.email,
            gstNumber: v.gstNumber, addressLine1: v.addressLine1 ?? v.address, addressLine2: v.addressLine2, city: v.city, state: v.state, pincode: v.pincode, country: v.country ?? "India",
            gstStatus: v.gstStatus, taxpayerType: v.taxpayerType, businessConstitution: v.businessConstitution, gstRegistrationDate: v.gstRegistrationDate, gstCancellationDate: v.gstCancellationDate,
            stateJurisdiction: v.stateJurisdiction, natureOfBusiness: v.natureOfBusiness, blockStatus: v.blockStatus, einvoiceStatus: v.einvoiceStatus,
        });
    }, [existing.data]);

    const verify = useMutation({
        mutationFn: async () => {
            const result = validateGstin(form.gstNumber ?? "");
            if (!result.valid) throw new Error(result.error);
            return vendorsApi.lookupGstin(workspaceId, result.gstin);
        },
        onMutate: () => setGstError(null),
        onSuccess: (data: GstinLookupData) => {
            setVerified(data);
            set({ ...getVendorFieldsFromGstin(data), ...getGstDetailsFromGstin(data), gstNumber: data.gstin });
            toast.success("GSTIN verified and registered details applied");
        },
        onError: (e: any) => {
            setVerified(null);
            setGstError(e?.message ?? "GSTIN verification failed.");
        },
    });

    const save = useMutation({
        mutationFn: () => {
            if (!form.name?.trim() && !form.companyName?.trim()) throw new Error("Enter a trade name or company name");
            if (hasGst && form.gstNumber) {
                const v = validateGstin(form.gstNumber);
                if (!v.valid) throw new Error(v.error);
            }
            const clean = (s?: string | null) => (s && s.trim() ? s.trim() : null);
            const body: VendorInput & { vendorType?: string } = {
                ...Object.fromEntries(Object.entries(form).map(([k, v]) => [k, typeof v === "string" ? clean(v) : v])),
                hasGst,
                gstNumber: hasGst ? clean(form.gstNumber) : null,
                ...(hasGst ? {} : Object.fromEntries(GST_FIELDS.map((f) => [f.key, null]))),
            };
            (body as any).vendorType = vendorType;
            return vendorId ? vendorsApi.update(workspaceId, vendorId, body) : vendorsApi.create(workspaceId, body);
        },
        onSuccess: (v: any) => {
            toast.success(vendorId ? "Supplier / contractor updated" : "Supplier / contractor added");
            qc.invalidateQueries({ queryKey: ["vendors", workspaceId] });
            if (vendorId) qc.invalidateQueries({ queryKey: qk.vendor(workspaceId, vendorId) });
            navigation.goBack();
            if (!vendorId && v?.id) navigation.navigate("VendorDetail", { vendorId: v.id });
        },
        onError: (e) => toast.fromError(e, "Failed to save supplier / contractor"),
    });

    if (vendorId && existing.isLoading) {
        return (
            <Screen>
                <ScreenHeader title="Edit Supplier / Contractor" back showActions={false} />
                <View style={{ padding: 16 }}>
                    <ListSkeleton rows={6} avatar={false} />
                </View>
            </Screen>
        );
    }

    const locked = !!verified;

    return (
        <Screen>
            <ScreenHeader title={vendorId ? "Edit Supplier / Contractor" : "New Supplier / Contractor"} back showActions={false} />
            <ScreenBody
                footer={
                    <BottomBar>
                        <Button title="Cancel" variant="outline" style={{ flex: 1 }} onPress={() => navigation.goBack()} />
                        <Button title={vendorId ? "Save changes" : "Add supplier / contractor"} style={{ flex: 1.6 }} loading={save.isPending} onPress={() => save.mutate()} />
                    </BottomBar>
                }
            >
                <Tabs scrollable={false} value={vendorType} onChange={setVendorType} items={[{ key: "SUPPLIER", label: "Supplier" }, { key: "CONTRACTOR", label: "Contractor" }]} />

                <Card padded={false}>
                    <CardHeader title="Business" />
                    <View style={{ padding: 16, gap: 12 }}>
                        <Input label="Trade name" placeholder="e.g. Mahadev Steel Trading" value={form.name ?? ""} onChangeText={(name) => set({ name })} />
                        <Input label="Company legal name" placeholder="e.g. Mahadev Steel & Co Pvt Ltd" value={form.companyName ?? ""} onChangeText={(companyName) => set({ companyName })} />
                        <Input label="Contact person" placeholder="e.g. Ramesh Kumar" value={form.contactPerson ?? ""} onChangeText={(contactPerson) => set({ contactPerson })} />
                        <Input label="Phone number" placeholder="9876543210" keyboardType="phone-pad" value={form.phoneNumber ?? ""} onChangeText={(phoneNumber) => set({ phoneNumber })} />
                        <Input label="Email" placeholder="e.g. ramesh@mahadevsteel.com" keyboardType="email-address" autoCapitalize="none" value={form.email ?? ""} onChangeText={(email) => set({ email })} />
                    </View>
                </Card>

                <Card padded={false}>
                    <CardHeader title="GST Registration" icon={ShieldCheck} />
                    <View style={{ padding: 16, gap: 12 }}>
                        <SwitchRow label="Registered under GST" value={hasGst} onChange={setHasGst} />
                        {hasGst ? (
                            <>
                                <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-end" }}>
                                    <Input
                                        label="GSTIN / Tax ID"
                                        containerStyle={{ flex: 1 }}
                                        placeholder="e.g. 27AAPFU0939F1ZV"
                                        autoCapitalize="characters"
                                        maxLength={15}
                                        value={form.gstNumber ?? ""}
                                        onChangeText={(v) => {
                                            set({ gstNumber: normalizeGstin(v).slice(0, 15) });
                                            setVerified(null);
                                            setGstError(null);
                                        }}
                                        error={gstError}
                                    />
                                    <Button variant="outline" title="Verify" loading={verify.isPending} onPress={() => verify.mutate()} style={{ marginBottom: gstError ? 22 : 0 }} />
                                </View>
                                {verified ? (
                                    <Banner tone={verified.status.toLowerCase() === "active" ? "success" : "warning"}>
                                        <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                                            <BadgeCheck size={14} color={verified.status.toLowerCase() === "active" ? colors.success : colors.warning} />
                                            <Text variant="small" weight="semibold">
                                                {verified.legal_name} · {verified.status}
                                            </Text>
                                        </View>
                                    </Banner>
                                ) : null}
                                {GST_FIELDS.map((f) => (
                                    <Input
                                        key={f.key}
                                        label={f.label}
                                        placeholder={f.placeholder}
                                        value={(form[f.key] as string) ?? ""}
                                        onChangeText={(v) => set({ [f.key]: v } as any)}
                                        editable={!locked}
                                        right={locked ? <Lock size={14} color={colors.mutedForeground} /> : undefined}
                                    />
                                ))}
                            </>
                        ) : null}
                    </View>
                </Card>

                <Card padded={false}>
                    <CardHeader title="Address" />
                    <View style={{ padding: 16, gap: 12 }}>
                        <Input label="Address line 1" placeholder="Plot / Door No / Building / Road" value={form.addressLine1 ?? ""} onChangeText={(addressLine1) => set({ addressLine1 })} />
                        <Input label="Address line 2" placeholder="Area / Locality / Landmark" value={form.addressLine2 ?? ""} onChangeText={(addressLine2) => set({ addressLine2 })} />
                        <View style={{ flexDirection: "row", gap: 8 }}>
                            <Input label="City / Town" containerStyle={{ flex: 1 }} placeholder="e.g. Mumbai" value={form.city ?? ""} onChangeText={(city) => set({ city })} />
                            <Input label="State" containerStyle={{ flex: 1 }} placeholder="e.g. Maharashtra" value={form.state ?? ""} onChangeText={(state) => set({ state })} />
                        </View>
                        <View style={{ flexDirection: "row", gap: 8 }}>
                            <Input label="PIN code" containerStyle={{ flex: 1 }} keyboardType="number-pad" placeholder="e.g. 400001" value={form.pincode ?? ""} onChangeText={(pincode) => set({ pincode })} />
                            <Input label="Country" containerStyle={{ flex: 1 }} value={form.country ?? ""} onChangeText={(country) => set({ country })} />
                        </View>
                    </View>
                </Card>
            </ScreenBody>
        </Screen>
    );
}
