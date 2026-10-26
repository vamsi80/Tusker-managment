import { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { endOfWeek, isBefore, isWithinInterval, startOfDay, startOfWeek } from "date-fns";
import { AlertTriangle, CalendarClock, CheckCircle2, ClipboardList, FileText, FilterX, Gavel, Package, Plus, Receipt, Send } from "lucide-react-native";
import { indentsApi, purchaseOrdersApi } from "../../api/procurement";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { qk } from "../../lib/query";
import { AWAITING_APPROVAL_STATUSES, INDENT_STATUS_FILTERS, INDENT_STATUS_LABELS, MATERIAL_STATUS_LABELS, PO_STATUS_TONE } from "../../lib/constants";
import { displayName, fmtDate, formatPaise, formatRate, pluralize, vendorDisplayName } from "../../lib/format";
import { canCreatePurchaseOrder } from "../../lib/purchase-order";
import { useAuth } from "../../providers/AuthProvider";
import { useTheme } from "../../theme/ThemeProvider";
import { radius } from "../../theme/tokens";
import { Badge, Button, Card, CardHeader, Chip, EmptyState, ListSkeleton, MultiSelect, SearchBar, Select, Text } from "../ui";
import { IndentCard, IndentStatusBadge } from "./IndentCard";
import { QuotesSheet } from "./QuotesSheet";
import { tone } from "../../theme/tone";

const ACTIVE_RFQ = ["RFQ_SENT", "QUOTES_RECEIVED"];
const CLOSED = ["APPROVED", "PO_CREATED"];
const TERMINAL = new Set(["APPROVED", "CANCELLED", "REJECTED"]);

/** procurement/_components/dashboard-client.tsx */
export function ProcurementDashboard({ onOpenTab }: { onOpenTab: (tab: "indents" | "rfqs" | "materials", status?: string[]) => void }) {
    const { colors } = useTheme();
    const { workspaceId } = useWorkspace();
    const indents = useQuery({ queryKey: qk.indents(workspaceId), queryFn: () => indentsApi.list(workspaceId), enabled: !!workspaceId });
    const items = useQuery({ queryKey: qk.lineItems(workspaceId), queryFn: () => indentsApi.lineItems(workspaceId).catch(() => []), enabled: !!workspaceId });

    const list = indents.data ?? [];
    const lineItems = items.data ?? [];
    const stats = [
        { label: "Total Indent Requests", value: list.length, color: colors.mutedForeground, icon: ClipboardList, onPress: () => onOpenTab("indents") },
        { label: "Awaiting Approvals", value: list.filter((i) => AWAITING_APPROVAL_STATUSES.includes(i.status)).length, color: tone("warning"), icon: Gavel, onPress: () => onOpenTab("indents", AWAITING_APPROVAL_STATUSES) },
        { label: "Active RFQ Sessions", value: lineItems.filter((i) => ACTIVE_RFQ.includes(i.status)).length, color: tone("info"), icon: Send, onPress: () => onOpenTab("rfqs") },
        { label: "Closed Procurements", value: lineItems.filter((i) => CLOSED.includes(i.status)).length, color: tone("success"), icon: CheckCircle2, onPress: () => onOpenTab("materials", CLOSED) },
    ];

    const today = startOfDay(new Date());
    const week = { start: startOfWeek(today, { weekStartsOn: 1 }), end: endOfWeek(today, { weekStartsOn: 1 }) };
    const active = list.filter((i) => !TERMINAL.has(i.status) && i.expectedDelivery);
    const dueThisWeek = active.filter((i) => !isBefore(new Date(i.expectedDelivery), today) && isWithinInterval(new Date(i.expectedDelivery), week));
    const overdue = active.filter((i) => isBefore(new Date(i.expectedDelivery), today)).sort((a, b) => +new Date(a.expectedDelivery) - +new Date(b.expectedDelivery));

    return (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 60 }} refreshControl={<RefreshControl refreshing={indents.isRefetching} onRefresh={() => { indents.refetch(); items.refetch(); }} tintColor={colors.primaryInk} />}>
            <View style={styles.stats}>
                {stats.map((s) => (
                    <Pressable key={s.label} onPress={s.onPress} style={({ pressed }) => [styles.stat, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}>
                        <s.icon size={16} color={s.color} />
                        <Text variant="overline" color={s.color}>
                            {s.label}
                        </Text>
                        <Text variant="h1">{indents.isLoading ? "–" : s.value}</Text>
                    </Pressable>
                ))}
            </View>
            <MiniIndentList title="Due This Week" icon={CalendarClock} items={dueThisWeek} empty="Nothing due this week" />
            <MiniIndentList title="Overdue" icon={AlertTriangle} items={overdue} empty="No overdue indents" tone={colors.destructive} />
        </ScrollView>
    );
}

function MiniIndentList({ title, icon, items, empty, tone }: { title: string; icon: any; items: any[]; empty: string; tone?: string }) {
    const navigation = useNavigation<any>();
    const { colors } = useTheme();
    return (
        <Card padded={false}>
            <CardHeader title={title} icon={icon} iconColor={tone} right={<Badge label={String(items.length)} size="xs" color={tone} />} />
            {items.length === 0 ? (
                <Text variant="small" tone="muted" center style={{ padding: 20 }}>
                    {empty}
                </Text>
            ) : (
                items.map((indent) => (
                    <Pressable key={indent.id} onPress={() => navigation.navigate("IndentDetail", { indentId: indent.id })} style={({ pressed }) => [styles.miniRow, { borderTopColor: colors.border, backgroundColor: pressed ? colors.secondary : "transparent" }]}>
                        <View style={{ flex: 1, gap: 2 }}>
                            <Text variant="mono" tone="primary" style={{ fontSize: 10 }}>
                                {indent.indentId || "Draft"}
                            </Text>
                            <Text variant="bodyMedium" numberOfLines={1}>
                                {indent.name}
                            </Text>
                            <Text variant="caption" tone="muted" numberOfLines={1}>
                                {indent.project?.name ?? "General"} · {INDENT_STATUS_LABELS[indent.status] ?? indent.status}
                            </Text>
                        </View>
                        <Text variant="caption" color={tone ?? colors.mutedForeground}>
                            {fmtDate(indent.expectedDelivery, "dd MMM")}
                        </Text>
                    </Pressable>
                ))
            )}
        </Card>
    );
}

/** procurement/_components/indents-client.tsx — the Indents Register. */
export function IndentsRegister({ initialStatus }: { initialStatus?: string[] }) {
    const { colors } = useTheme();
    const navigation = useNavigation<any>();
    const { workspaceId, role } = useWorkspace();
    const [search, setSearch] = useState("");
    const [status, setStatus] = useState<string[]>(initialStatus ?? []);
    const [project, setProject] = useState<string | null>(null);
    const [requester, setRequester] = useState<string | null>(null);
    const q = useQuery({ queryKey: qk.indents(workspaceId), queryFn: () => indentsApi.list(workspaceId), enabled: !!workspaceId });

    const all = q.data ?? [];
    const projectOptions = useMemo(() => uniq(all.filter((i) => i.project).map((i) => ({ value: i.project.id, label: i.project.name }))), [all]);
    const requesterOptions = useMemo(() => uniq(all.filter((i) => i.requestedById).map((i) => ({ value: i.requestedById, label: displayName(i.requestedBy?.user) }))), [all]);
    const filtered = useMemo(() => {
        const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
        return all.filter((i) => {
            if (status.length && !status.includes(i.status)) return false;
            if (project && i.project?.id !== project) return false;
            if (requester && i.requestedById !== requester) return false;
            if (!terms.length) return true;
            const hay = [i.indentId, i.name, i.project?.name, displayName(i.requestedBy?.user), vendorDisplayName(i.selectedVendor, ""), INDENT_STATUS_LABELS[i.status], i.task?.name].join(" ").toLowerCase();
            return terms.every((t) => hay.includes(t));
        });
    }, [all, search, status, project, requester]);
    const filterCount = status.length + (project ? 1 : 0) + (requester ? 1 : 0);

    return (
        <FlatList
            data={filtered}
            keyExtractor={(i) => i.id}
            renderItem={({ item }) => <IndentCard indent={item} />}
            contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 60 }}
            refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={colors.primaryInk} />}
            ListHeaderComponent={
                <View style={{ gap: 10, marginBottom: 4 }}>
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <Text variant="h3" style={{ flex: 1 }}>
                            Indents Register
                        </Text>
                        {role !== "ACCOUNTS" ? <Button size="sm" icon={Plus} title="Create Indent" onPress={() => navigation.navigate("IndentForm")} /> : null}
                    </View>
                    <SearchBar value={search} onChangeText={setSearch} placeholder="Search number, name, project, requester, supplier…" />
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                        {filterCount ? <Chip label="Reset filters" icon={FilterX} onPress={() => { setStatus([]); setProject(null); setRequester(null); }} /> : null}
                        <MultiSelect title="Status" values={status} onChange={setStatus} options={INDENT_STATUS_FILTERS} trigger={(open) => <Chip label={status.length ? `Status · ${status.length}` : "All statuses"} active={!!status.length} onPress={open} />} />
                        <Select title="Project" value={project} onChange={setProject} allowClear options={projectOptions} trigger={(open, label) => <Chip label={label ?? "All projects"} active={!!project} onPress={open} />} />
                        <Select title="Requester" value={requester} onChange={setRequester} allowClear options={requesterOptions} trigger={(open, label) => <Chip label={label ?? "All requesters"} active={!!requester} onPress={open} />} />
                    </ScrollView>
                    <Text variant="caption" tone="muted">
                        Showing <Text variant="caption" weight="bold">{filtered.length}</Text> of {all.length}
                    </Text>
                </View>
            }
            ListEmptyComponent={q.isLoading ? <ListSkeleton rows={5} avatar={false} /> : <EmptyState icon={ClipboardList} title="No indents found" description={filterCount || search ? "Try clearing the filters." : "Raise an indent to request materials."} />}
        />
    );
}

/** procurement/pos/page.tsx */
export function PurchaseOrdersList() {
    const { colors } = useTheme();
    const navigation = useNavigation<any>();
    const auth = useAuth();
    const { workspaceId, role } = useWorkspace();
    const q = useQuery({ queryKey: qk.pos(workspaceId), queryFn: () => purchaseOrdersApi.list(workspaceId), enabled: !!workspaceId });
    const canCreate = canCreatePurchaseOrder(auth.status === "signedIn" ? auth.user.email : null, role);

    return (
        <FlatList
            data={q.data ?? []}
            keyExtractor={(p) => p.id}
            contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 60 }}
            refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={colors.primaryInk} />}
            ListHeaderComponent={
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
                    <Text variant="h3" style={{ flex: 1 }}>
                        Purchase Orders
                    </Text>
                    {canCreate ? <Button size="sm" icon={Plus} title="New PO" onPress={() => navigation.navigate("PurchaseOrderForm")} /> : null}
                </View>
            }
            ListEmptyComponent={q.isLoading ? <ListSkeleton rows={4} avatar={false} /> : <EmptyState icon={Receipt} title="No purchase orders yet" description="Raise a PO from an approved indent." />}
            renderItem={({ item: po }) => (
                <Card onPress={() => navigation.navigate("PurchaseOrder", { poId: po.id })} style={{ gap: 6 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Text variant="mono" weight="bold">
                            {po.poNumber}
                        </Text>
                        <View style={{ flex: 1 }} />
                        <Badge label={po.status} size="xs" color={PO_STATUS_TONE[po.status]} />
                    </View>
                    <Text variant="title" numberOfLines={1}>
                        {vendorDisplayName(po.vendor)}
                    </Text>
                    {po.indent ? (
                        <Text variant="caption" tone="muted" numberOfLines={1}>
                            {[po.indent.indentId, po.indent.name].filter(Boolean).join(" · ")}
                        </Text>
                    ) : null}
                    <View style={{ flexDirection: "row", alignItems: "center", paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.border }}>
                        <Text variant="caption" tone="muted" style={{ flex: 1 }}>
                            {fmtDate(po.poDate)} · {pluralize(po._count?.items ?? 0, "item")} · {po.company}
                        </Text>
                        <Text variant="mono" weight="bold">
                            {formatPaise(po.grandTotal)}
                        </Text>
                    </View>
                </Card>
            )}
        />
    );
}

/** procurement/_components/materials-hub-client.tsx — every indent line item, grouped by material. */
export function MaterialsHub({ initialStatus }: { initialStatus?: string[] }) {
    const { colors } = useTheme();
    const navigation = useNavigation<any>();
    const { workspaceId } = useWorkspace();
    const [status, setStatus] = useState<string[]>(initialStatus ?? []);
    const [search, setSearch] = useState("");
    const q = useQuery({ queryKey: qk.lineItems(workspaceId, { status }), queryFn: () => indentsApi.lineItems(workspaceId, { status }), enabled: !!workspaceId });

    const groups = useMemo(() => {
        const map = new Map<string, any[]>();
        for (const item of q.data ?? []) {
            if (search && !item.materialName.toLowerCase().includes(search.toLowerCase())) continue;
            const key = item.materialName.toLowerCase().trim();
            map.set(key, [...(map.get(key) ?? []), item]);
        }
        return [...map.values()].sort((a, b) => a[0].materialName.localeCompare(b[0].materialName));
    }, [q.data, search]);

    return (
        <FlatList
            data={groups}
            keyExtractor={(g) => g[0].materialName}
            contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 60 }}
            refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={colors.primaryInk} />}
            ListHeaderComponent={
                <View style={{ gap: 10, marginBottom: 4 }}>
                    <Text variant="h3">Materials</Text>
                    <SearchBar value={search} onChangeText={setSearch} placeholder="Search materials…" />
                    <MultiSelect
                        title="Material status"
                        values={status}
                        onChange={setStatus}
                        options={Object.entries(MATERIAL_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
                        trigger={(open) => <Chip label={status.length ? `Status · ${status.length}` : "All statuses"} active={!!status.length} onPress={open} />}
                    />
                </View>
            }
            ListEmptyComponent={q.isLoading ? <ListSkeleton rows={4} avatar={false} /> : <EmptyState icon={Package} title="No materials found" />}
            renderItem={({ item: rows }) => {
                const totalQty = rows.reduce((s: number, r: any) => s + (Number(r.quantity) || 0), 0);
                return (
                    <Card padded={false}>
                        <View style={{ flexDirection: "row", alignItems: "center", padding: 14, gap: 8 }}>
                            <View style={{ flex: 1 }}>
                                <Text variant="title">{rows[0].materialName}</Text>
                                <Text variant="caption" tone="muted">
                                    {rows[0].materialId ? `${rows[0].materialId} · ` : ""}
                                    {rows.length} request{rows.length === 1 ? "" : "s"}
                                </Text>
                            </View>
                            <Text variant="title">
                                {totalQty} <Text tone="muted">{rows[0].unit}</Text>
                            </Text>
                        </View>
                        {rows.map((r: any) => (
                            <Pressable key={r.id} onPress={() => navigation.navigate("IndentDetail", { indentId: r.indent.id })} style={({ pressed }) => [styles.miniRow, { borderTopColor: colors.border, backgroundColor: pressed ? colors.secondary : "transparent" }]}>
                                <View style={{ flex: 1, gap: 3 }}>
                                    <Text variant="small" weight="semibold" numberOfLines={1}>
                                        {r.indent.indentId || "Draft"} · {r.indent.project?.name ?? "General"}
                                    </Text>
                                    <View style={{ flexDirection: "row", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                                        <Badge label={MATERIAL_STATUS_LABELS[r.status] ?? r.status} size="xs" variant="muted" />
                                        <IndentStatusBadge status={r.indent.status} size="xs" />
                                        {r.vendor ? (
                                            <Text variant="caption" tone="muted" numberOfLines={1}>
                                                {vendorDisplayName(r.vendor)}
                                            </Text>
                                        ) : null}
                                    </View>
                                </View>
                                <View style={{ alignItems: "flex-end" }}>
                                    <Text variant="small">
                                        {r.quantity} {r.unit}
                                    </Text>
                                    <Text variant="mono" tone="muted">
                                        {formatRate(r.finalUnitPrice ?? r.estimatedUnitPrice)}
                                    </Text>
                                </View>
                            </Pressable>
                        ))}
                    </Card>
                );
            }}
        />
    );
}

/** procurement/_components/rfqs-client.tsx — line items with an open RFQ, and their quotes. */
export function RfqList() {
    const { colors } = useTheme();
    const navigation = useNavigation<any>();
    const { workspaceId, role } = useWorkspace();
    const [quotesFor, setQuotesFor] = useState<any | null>(null);
    const q = useQuery({ queryKey: qk.lineItems(workspaceId, { status: ACTIVE_RFQ }), queryFn: () => indentsApi.lineItems(workspaceId, { status: ACTIVE_RFQ }), enabled: !!workspaceId });
    const canSend = ["OWNER", "ADMIN", "MANAGER", "PROCUREMENT"].includes(role ?? "");

    return (
        <>
            <FlatList
                data={q.data ?? []}
                keyExtractor={(i) => i.id}
                contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 60 }}
                refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={colors.primaryInk} />}
                ListHeaderComponent={
                    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
                        <Text variant="h3" style={{ flex: 1 }}>
                            Active RFQs
                        </Text>
                        {canSend ? <Button size="sm" icon={Plus} title="New RFQ" onPress={() => navigation.navigate("RfqCreate")} /> : null}
                    </View>
                }
                ListEmptyComponent={q.isLoading ? <ListSkeleton rows={4} avatar={false} /> : <EmptyState icon={FileText} title="No active RFQs" description="Send an RFQ to suppliers to collect quotes." />}
                renderItem={({ item }) => (
                    <Card onPress={() => setQuotesFor(item)} style={{ gap: 6 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                            <Text variant="title" style={{ flex: 1 }} numberOfLines={1}>
                                {item.materialName}
                            </Text>
                            <Badge label={MATERIAL_STATUS_LABELS[item.status]} size="xs" color={item.status === "QUOTES_RECEIVED" ? "#047857" : "#1d4ed8"} />
                        </View>
                        <Text variant="caption" tone="muted">
                            {item.indent.indentId} · {item.indent.project?.name ?? "General"} · {item.quantity} {item.unit}
                        </Text>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                            <Text variant="caption" tone="muted" style={{ flex: 1 }}>
                                {item.quotesCount} quote{item.quotesCount === 1 ? "" : "s"}
                                {item.rfqDeadline ? ` · due ${fmtDate(item.rfqDeadline, "dd MMM")}` : ""}
                            </Text>
                            <Text variant="label" tone="primary">
                                View quotes
                            </Text>
                        </View>
                    </Card>
                )}
            />
            {quotesFor ? <QuotesSheet lineItem={quotesFor} onClose={() => setQuotesFor(null)} onChanged={() => q.refetch()} /> : null}
        </>
    );
}

function uniq<T extends { value: string }>(items: T[]) {
    const seen = new Set<string>();
    return items.filter((i) => (seen.has(i.value) ? false : (seen.add(i.value), true)));
}

const styles = StyleSheet.create({
    stats: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    stat: { flexBasis: "47%", flexGrow: 1, borderWidth: 1, borderRadius: radius.lg, padding: 14, gap: 6 },
    miniRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: 1 },
});
