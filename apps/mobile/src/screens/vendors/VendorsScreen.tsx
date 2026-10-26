import { useMemo, useState } from "react";
import { FlatList, RefreshControl, ScrollView, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Building2, CheckCircle2, MapPin, MoreHorizontal, Phone, Plus } from "lucide-react-native";
import { Pressable } from "react-native";
import { vendorsApi } from "../../api/procurement";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { qk } from "../../lib/query";
import { VENDOR_STATUS_TONE } from "../../lib/constants";
import { vendorDisplayName } from "../../lib/format";
import { toast } from "../../lib/toast";
import { useTheme } from "../../theme/ThemeProvider";
import { ActionMenu, Badge, Button, Card, Chip, EmptyState, ListSkeleton, MultiSelect, SearchBar, Text } from "../../components/ui";
import { Screen, ScreenHeader } from "../../components/layout/Screen";

/** /w/[workspaceId]/vendors — Suppliers / Contractors. */
export function VendorsScreen() {
    const { colors } = useTheme();
    const navigation = useNavigation<any>();
    const qc = useQueryClient();
    const { workspaceId, can, isAdmin, role } = useWorkspace();
    const [search, setSearch] = useState("");
    const [status, setStatus] = useState<string[]>([]);
    const [types, setTypes] = useState<string[]>([]);
    const [locations, setLocations] = useState<string[]>([]);
    const [menu, setMenu] = useState<any | null>(null);
    const q = useQuery({ queryKey: qk.vendors(workspaceId), queryFn: () => vendorsApi.list(workspaceId), enabled: !!workspaceId });
    const canManage = isAdmin || role === "PROCUREMENT";

    const all = q.data ?? [];
    const locationOf = (v: any) => [v.city, v.state].filter(Boolean).join(", ");
    const locationOptions = useMemo(() => [...new Set(all.map(locationOf).filter(Boolean))].map((l) => ({ value: l, label: l })), [all]);
    const filtered = all.filter((v) => {
        if (status.length && !status.includes(v.status)) return false;
        if (types.length && !types.includes(v.vendorType ?? "SUPPLIER")) return false;
        if (locations.length && !locations.includes(locationOf(v))) return false;
        const s = search.trim().toLowerCase();
        return !s || [v.name, v.companyName, v.vendorId, v.contactPerson, v.gstNumber].filter(Boolean).join(" ").toLowerCase().includes(s);
    });

    const toggleBlock = useMutation({
        mutationFn: (v: any) => (v.status === "BLACKLISTED" ? vendorsApi.update(workspaceId, v.id, { status: "ACTIVE" }) : vendorsApi.blacklist(workspaceId, v.id)),
        onSuccess: (_, v) => {
            toast.success(v.status === "BLACKLISTED" ? "Supplier / contractor reactivated" : "Supplier / contractor blacklisted");
            qc.invalidateQueries({ queryKey: ["vendors", workspaceId] });
        },
        onError: (e) => toast.fromError(e),
    });

    if (!can("vendors:view")) {
        return (
            <Screen>
                <ScreenHeader title="Suppliers / Contractors" />
                <EmptyState title="You don't have access to Suppliers / Contractors." />
            </Screen>
        );
    }

    return (
        <Screen>
            <ScreenHeader title="Suppliers / Contractors" />
            <FlatList
                data={filtered}
                keyExtractor={(v) => v.id}
                contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 60 }}
                refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={colors.primaryInk} />}
                ListHeaderComponent={
                    <View style={{ gap: 10, marginBottom: 4 }}>
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                            <Text variant="small" tone="muted" style={{ flex: 1 }}>
                                {filtered.length} of {all.length}
                            </Text>
                            {canManage ? <Button size="sm" icon={Plus} title="Add new" onPress={() => navigation.navigate("VendorForm")} /> : null}
                        </View>
                        <SearchBar value={search} onChangeText={setSearch} placeholder="Search name, company, ID, GSTIN…" />
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                            <MultiSelect title="Status" values={status} onChange={setStatus} options={[{ value: "ACTIVE", label: "Active" }, { value: "BLACKLISTED", label: "Blacklisted" }]} trigger={(open) => <Chip label={status.length ? `Status · ${status.length}` : "Status"} active={!!status.length} onPress={open} />} />
                            <MultiSelect title="Type" values={types} onChange={setTypes} options={[{ value: "SUPPLIER", label: "Supplier" }, { value: "CONTRACTOR", label: "Contractor" }]} trigger={(open) => <Chip label={types.length ? `Type · ${types.length}` : "Type"} active={!!types.length} onPress={open} />} />
                            <MultiSelect title="Location" values={locations} onChange={setLocations} options={locationOptions} searchable trigger={(open) => <Chip label={locations.length ? `Location · ${locations.length}` : "Location"} active={!!locations.length} onPress={open} />} />
                        </ScrollView>
                    </View>
                }
                ListEmptyComponent={q.isLoading ? <ListSkeleton rows={5} /> : <EmptyState icon={Building2} title="No suppliers / contractors" description="Add your first supplier or contractor." />}
                renderItem={({ item: v }) => (
                    <Card onPress={() => navigation.navigate("VendorDetail", { vendorId: v.id })} style={{ gap: 6 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                            <Text variant="mono" tone="muted">
                                {v.vendorId}
                            </Text>
                            <Badge label={(v.vendorType ?? "SUPPLIER").toLowerCase()} size="xs" variant="muted" />
                            <View style={{ flex: 1 }} />
                            <Badge label={v.status} size="xs" color={VENDOR_STATUS_TONE[v.status]} />
                            {canManage ? (
                                <Pressable hitSlop={8} onPress={() => setMenu(v)}>
                                    <MoreHorizontal size={18} color={colors.mutedForeground} />
                                </Pressable>
                            ) : null}
                        </View>
                        <Text variant="title">{vendorDisplayName(v)}</Text>
                        {v.companyName && v.companyName !== v.name ? (
                            <Text variant="caption" tone="muted">
                                {v.companyName}
                            </Text>
                        ) : null}
                        <View style={{ flexDirection: "row", gap: 14, flexWrap: "wrap" }}>
                            {locationOf(v) ? <Meta icon={MapPin} text={locationOf(v)} /> : null}
                            {v.phoneNumber ? <Meta icon={Phone} text={v.phoneNumber} /> : null}
                            {v.gstNumber ? <Meta icon={CheckCircle2} text={v.gstNumber} /> : null}
                        </View>
                    </Card>
                )}
            />
            <ActionMenu
                open={!!menu}
                onClose={() => setMenu(null)}
                title={menu ? vendorDisplayName(menu) : ""}
                actions={[
                    { label: "View profile", icon: Building2, onPress: () => navigation.navigate("VendorDetail", { vendorId: menu.id }) },
                    { label: "Edit", icon: Plus, hidden: !isAdmin, onPress: () => navigation.navigate("VendorForm", { vendorId: menu.id }) },
                    {
                        label: menu?.status === "BLACKLISTED" ? "Reactivate" : "Blacklist",
                        icon: Ban,
                        destructive: menu?.status !== "BLACKLISTED",
                        hidden: !isAdmin,
                        onPress: () => toggleBlock.mutate(menu),
                    },
                ]}
            />
        </Screen>
    );
}

function Meta({ icon: Icon, text }: { icon: any; text: string }) {
    const { colors } = useTheme();
    return (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Icon size={12} color={colors.mutedForeground} />
            <Text variant="caption" tone="muted">
                {text}
            </Text>
        </View>
    );
}
