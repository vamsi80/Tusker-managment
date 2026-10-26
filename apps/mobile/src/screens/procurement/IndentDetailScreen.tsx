import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Check, Edit, FileCheck, FileText, MoreHorizontal, Package, Pencil, Plus, ReceiptText, Save, Trash2, User, X } from "lucide-react-native";
import { indentsApi, materialsApi, vendorsApi } from "../../api/procurement";
import { workspacesApi } from "../../api/workspaces";
import { useAuth } from "../../providers/AuthProvider";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { qk } from "../../lib/query";
import { realtime, EVENTS } from "../../lib/realtime";
import { FALLBACK_UNITS, MATERIAL_STATUS_LABELS, approveActionLabel } from "../../lib/constants";
import { displayName, fmtDate, formatRate, vendorDisplayName } from "../../lib/format";
import { canCreatePurchaseOrder } from "../../lib/purchase-order";
import { toast } from "../../lib/toast";
import { useTheme } from "../../theme/ThemeProvider";
import { radius } from "../../theme/tokens";
import { ActionMenu, Avatar, Badge, Banner, Button, Card, CardHeader, DateField, ErrorState, Input, ListSkeleton, MultiSelect, Select, Sheet, Text, confirm, prompt, tint } from "../../components/ui";
import { BottomBar, Screen, ScreenBody, ScreenHeader } from "../../components/layout/Screen";
import { IndentStatusBadge } from "../../components/procurement/IndentCard";
import type { RootStackParamList } from "../../navigation/types";
import { tone } from "../../theme/tone";

type ApprovalState = "APPROVED" | "PENDING" | "WAITING" | "REJECTED";

/** procurement/indents/[indentId] — indent-detail-client.tsx. */
export function IndentDetailScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, "IndentDetail">) {
    const { indentId } = route.params;
    const { colors } = useTheme();
    const qc = useQueryClient();
    const auth = useAuth();
    const { workspaceId, permissions } = useWorkspace();
    const workspaceRole = permissions?.workspaceRole ?? null;
    const workspaceMemberId = permissions?.workspaceMemberId ?? null;
    const isAccounts = workspaceRole === "ACCOUNTS";
    const isApprover = ["OWNER", "ADMIN", "MANAGER"].includes(workspaceRole ?? "");

    const q = useQuery({ queryKey: qk.indent(workspaceId, indentId), queryFn: () => indentsApi.get(workspaceId, indentId), enabled: !!workspaceId });
    const slim = useQuery({ queryKey: qk.membersSlim(workspaceId), queryFn: () => workspacesApi.membersSlim(workspaceId), enabled: !!workspaceId });
    const indent = q.data;
    const refresh = () => {
        qc.invalidateQueries({ queryKey: qk.indent(workspaceId, indentId) });
        qc.invalidateQueries({ queryKey: qk.indents(workspaceId) });
        qc.invalidateQueries({ queryKey: ["line-items", workspaceId] });
    };

    // Several people act on one indent; follow its stage live.
    useEffect(
        () =>
            realtime.subscribe(EVENTS.TEAM_UPDATE, (data) => {
                if (data?.action !== "PROJECT_INDENT_UPDATED") return;
                const changed = data?.payload?.indentId;
                if (!changed || changed === indentId) qc.invalidateQueries({ queryKey: qk.indent(workspaceId, indentId) });
            }),
        [qc, workspaceId, indentId],
    );

    const [menu, setMenu] = useState(false);
    const [editOpen, setEditOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<any | null>(null);
    const [addingItem, setAddingItem] = useState(false);
    const [finalRates, setFinalRates] = useState<Record<string, string>>({});
    const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);

    useEffect(() => {
        if (!indent) return;
        setFinalRates(Object.fromEntries((indent.lineItems ?? []).map((i: any) => [i.id, i.finalUnitPrice ? String(i.finalUnitPrice / 100) : ""])));
        setSelectedVendorId(indent.selectedVendorId ?? null);
    }, [indent?.id, indent?.status]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Who can do what (mirrors the web client, which mirrors IndentService) ──
    const rules = useMemo(() => {
        if (!indent) return null;
        const isRequester = !!workspaceMemberId && workspaceMemberId === indent.requestedById;
        const approverIds: string[] = indent.approverIds ?? [];
        const allOwnersAuthorized = approverIds.length > 0 && approverIds.every((id) => indent.approvedByIds?.includes(id));
        const isInitialRevision = indent.status === "REJECTED" && indent.rejectedStage !== "FINAL";
        const isFinalRateEntry = indent.status === "COMPARATIVES_IN_PROGRESS" || (indent.status === "REJECTED" && indent.rejectedStage === "FINAL");
        const canEdit = !isAccounts && (indent.status === "DRAFT" || isInitialRevision) && (isRequester || isApprover);
        const managerApproverId = indent.raisedInProject
            ? indent.project?.projectManagerId ?? indent.requestedBy?.reportToId
            : indent.requestedBy?.reportToId ?? indent.project?.projectManagerId;
        const isManagerForIndent =
            workspaceRole === "OWNER" || (!!workspaceMemberId && (managerApproverId ? workspaceMemberId === managerApproverId : ["MANAGER", "ADMIN"].includes(workspaceRole ?? "")));
        const isSelectedOwner = !!workspaceMemberId && approverIds.includes(workspaceMemberId) && ["OWNER", "ADMIN"].includes(workspaceRole ?? "");
        const managerStage = ["SUBMITTED", "ASSIGNED", "PENDING_MANAGER_FINAL_RATE_APPROVAL"].includes(indent.status);
        const ownerStage = ["PENDING_OWNER_APPROVAL", "PENDING_OWNER_COMPARATIVE_APPROVAL", "PENDING_OWNER_FINAL_APPROVAL"].includes(indent.status);
        const isReviewer = (managerStage && isManagerForIndent) || (ownerStage && isSelectedOwner);
        const revisionStage: "ESTIMATE" | "FINAL" | null =
            isAccounts || canEdit || !isReviewer ? null : ["PENDING_MANAGER_FINAL_RATE_APPROVAL", "PENDING_OWNER_FINAL_APPROVAL"].includes(indent.status) ? "FINAL" : "ESTIMATE";
        const canEnterFinalRates = !isAccounts && (isRequester || isManagerForIndent) && isFinalRateEntry && allOwnersAuthorized;
        const isIndentManager = !isAccounts && isApprover;
        return {
            isRequester,
            canEdit,
            revisionStage,
            canRevise: revisionStage !== null,
            canEnterFinalRates,
            managerApproverId,
            canApproveAsManager: !isAccounts && managerStage && isManagerForIndent,
            canApproveAsOwner: !isAccounts && ownerStage && isSelectedOwner,
            canEditIndent: (isIndentManager || (isRequester && canEdit)) && indent.status !== "CANCELLED",
            canDeleteIndent: isIndentManager && !(indent.purchaseOrders?.length > 0),
            canCancel: !isAccounts && (isRequester || isIndentManager) && !["APPROVED", "CANCELLED"].includes(indent.status),
            canSubmit: indent.status === "DRAFT" && isRequester && !isAccounts,
            canResubmit: indent.status === "REJECTED" && isRequester && indent.rejectedStage !== "FINAL" && !isAccounts,
            canCreatePo: indent.status === "APPROVED" && canCreatePurchaseOrder(auth.status === "signedIn" ? auth.user.email : null, workspaceRole),
        };
    }, [indent, workspaceMemberId, workspaceRole, isAccounts, isApprover, auth]);

    const memberName = (id: string | null | undefined) => {
        const m = (slim.data ?? []).find((x: any) => x.id === id);
        return m ? displayName(m.user ?? m) : "Any manager";
    };

    const approvalRows = useMemo(() => {
        if (!indent || !rules) return [];
        const owners: string[] = indent.approverIds ?? [];
        const rejectedAtFinal = indent.rejectedStage === "FINAL";
        const state = (approved: boolean, current: boolean, finalStage: boolean): ApprovalState =>
            approved ? "APPROVED" : indent.status === "REJECTED" && rejectedAtFinal === finalStage ? "REJECTED" : current ? "PENDING" : "WAITING";
        return [
            { key: "m1", stage: "Manager review", person: memberName(rules.managerApproverId), state: state(!!indent.managerApprovedAt, ["SUBMITTED", "ASSIGNED"].includes(indent.status), false) },
            ...owners.map((id) => ({ key: `o1-${id}`, stage: "Owner authorization", person: memberName(id), state: state(!!indent.approvedByIds?.includes(id), ["PENDING_OWNER_APPROVAL", "PENDING_OWNER_COMPARATIVE_APPROVAL"].includes(indent.status), false) })),
            { key: "m2", stage: "Manager final rates", person: memberName(rules.managerApproverId), state: state(!!indent.finalManagerApprovedAt, indent.status === "PENDING_MANAGER_FINAL_RATE_APPROVAL", true) },
            ...owners.map((id) => ({ key: `o2-${id}`, stage: "Owner final approval", person: memberName(id), state: state(!!indent.finalOwnerApprovedByIds?.includes(id), indent.status === "PENDING_OWNER_FINAL_APPROVAL", true) })),
        ];
    }, [indent, rules, slim.data]); // eslint-disable-line react-hooks/exhaustive-deps

    const vendors = useQuery({
        queryKey: qk.vendors(workspaceId, { status: "ACTIVE" }),
        queryFn: () => vendorsApi.list(workspaceId, { status: "ACTIVE" }),
        enabled: !!rules?.canEnterFinalRates,
    });

    const run = (fn: () => Promise<any>, success: string) =>
        fn()
            .then(() => {
                toast.success(success);
                refresh();
            })
            .catch((e) => {
                toast.fromError(e);
                refresh();
            });

    const act = useMutation({ mutationFn: async (fn: () => Promise<void>) => fn() });
    const busy = act.isPending;

    const approve = () => act.mutate(() => run(() => indentsApi.approve(workspaceId, indentId), "Indent approved successfully"));
    const reject = async () => {
        const reason = await prompt({ title: "Enter rejection reason", placeholder: "Why is this indent going back for revision?", multiline: true });
        if (reason) act.mutate(() => run(() => indentsApi.reject(workspaceId, indentId, reason), "Indent returned to the requester for revision"));
    };
    const submit = () => {
        if (!indent?.lineItems?.length) return toast.error("Cannot submit an empty indent. Please add at least one material.");
        act.mutate(() => run(() => indentsApi.submit(workspaceId, indentId), "Request raised successfully"));
    };
    const resubmit = () => act.mutate(() => run(() => indentsApi.resubmit(workspaceId, indentId), "Indent resubmitted for approval"));
    const cancel = async () => {
        const reason = await prompt({ title: "Cancel this indent", message: "Open materials and quotes are closed. The record is kept.", placeholder: "Reason for cancelling", confirmLabel: "Cancel indent" });
        if (reason) act.mutate(() => run(() => indentsApi.cancel(workspaceId, indentId, reason), "Indent cancelled"));
    };
    const remove = async () => {
        if (!(await confirm({ title: "Delete this indent?", message: `${indent?.indentId || "This indent"} and all of its materials will be permanently removed. To keep the record instead, cancel the indent.`, confirmLabel: "Delete Indent", destructive: true }))) return;
        act.mutate(() =>
            indentsApi
                .remove(workspaceId, indentId)
                .then(() => {
                    toast.success("Indent deleted");
                    qc.invalidateQueries({ queryKey: qk.indents(workspaceId) });
                    navigation.goBack();
                })
                .catch((e) => toast.fromError(e, "Failed to delete indent")),
        );
    };
    const submitFinal = () => {
        const rates = (indent?.lineItems ?? []).map((item: any) => ({ itemId: item.id, finalUnitPrice: Math.round(Number(finalRates[item.id] || 0) * 100) }));
        if (rates.some((r: any) => r.finalUnitPrice <= 0)) return toast.error("Enter a positive final rate for every material");
        act.mutate(() => run(() => indentsApi.submitFinalRates(workspaceId, indentId, rates, selectedVendorId ?? undefined), "Price submitted to the manager"));
    };
    const removeItem = async (item: any) => {
        if (await confirm({ title: "Remove this material from the indent?", confirmLabel: "Remove", destructive: true }))
            act.mutate(() => run(() => indentsApi.removeItem(workspaceId, indentId, item.id), "Material removed"));
    };

    if (q.isError) {
        return (
            <Screen>
                <ScreenHeader title="Indent" back showActions={false} />
                <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />
            </Screen>
        );
    }
    if (!indent || !rules) {
        return (
            <Screen>
                <ScreenHeader title="Indent" back showActions={false} />
                <View style={{ padding: 16 }}>
                    <ListSkeleton rows={6} avatar={false} />
                </View>
            </Screen>
        );
    }

    const subtotal = (indent.lineItems ?? []).reduce((t: number, i: any) => t + Number(i.estimatedUnitPrice || 0) * Number(i.quantity || 0), 0);
    const pctCharges = [
        { label: "Tax", pct: Number(indent.taxPercent || 0) },
        { label: "Excise duty", pct: Number(indent.exciseDutyPercent || 0) },
        { label: "VAT", pct: Number(indent.vatPercent || 0) },
    ].filter((c) => c.pct > 0);
    const flatCharges = [
        { label: "Transportation", amount: Number(indent.transportCharge || 0) },
        { label: "Labour", amount: Number(indent.labourCharge || 0) },
    ].filter((c) => c.amount > 0);
    const chargeTotal = pctCharges.reduce((t, c) => t + subtotal * (c.pct / 100), 0) + flatCharges.reduce((t, c) => t + c.amount, 0);

    const primaryActions = (
        <>
            {rules.canApproveAsManager || rules.canApproveAsOwner ? (
                <>
                    <Button variant="destructiveOutline" icon={X} title="Reject" style={{ flex: 1 }} disabled={busy} onPress={reject} />
                    <Button variant="success" icon={Check} title={approveActionLabel(indent.status)} style={{ flex: 1.6 }} loading={busy} onPress={approve} />
                </>
            ) : null}
            {rules.canSubmit ? <Button variant="info" icon={FileCheck} title="Raise Request" style={{ flex: 1 }} loading={busy} onPress={submit} /> : null}
            {rules.canResubmit ? <Button icon={FileCheck} title="Resubmit Revised Indent" style={{ flex: 1 }} loading={busy} onPress={resubmit} /> : null}
            {rules.canCreatePo ? <Button variant="info" icon={FileCheck} title="Download PO" style={{ flex: 1 }} onPress={() => navigation.navigate("PurchaseOrderForm", { indentId })} /> : null}
        </>
    );
    const hasPrimary = rules.canApproveAsManager || rules.canApproveAsOwner || rules.canSubmit || rules.canResubmit || rules.canCreatePo;

    return (
        <Screen>
            <ScreenHeader
                title={indent.name}
                subtitle={`Indent ID: ${indent.indentId || "Draft"}`}
                back
                showActions={false}
                right={
                    rules.canEditIndent || rules.canDeleteIndent || rules.canCancel ? (
                        <Pressable hitSlop={8} onPress={() => setMenu(true)} style={{ padding: 8 }}>
                            <MoreHorizontal size={20} color={colors.foreground} />
                        </Pressable>
                    ) : null
                }
            />
            <ScreenBody refreshing={q.isRefetching} onRefresh={() => q.refetch()} footer={hasPrimary ? <BottomBar>{primaryActions}</BottomBar> : undefined}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <IndentStatusBadge status={indent.status} />
                    {indent.selectedVendor ? (
                        <Text variant="small" tone="muted">
                            Supplier / Contractor: <Text variant="small" weight="semibold">{vendorDisplayName(indent.selectedVendor)}</Text>
                        </Text>
                    ) : null}
                </View>

                {indent.status === "REJECTED" && indent.rejectionReason ? (
                    <Banner tone="destructive" title="Rejected for revision">
                        {indent.rejectionReason}
                    </Banner>
                ) : null}
                {indent.status === "CANCELLED" && indent.cancelReason ? (
                    <Banner tone="destructive" title="Cancelled">
                        {indent.cancelReason}
                    </Banner>
                ) : null}

                <Card padded={false}>
                    <CardHeader title="Project Context" icon={FileText} />
                    <View style={{ padding: 16, flexDirection: "row", gap: 16 }}>
                        <View style={{ flex: 1, gap: 3 }}>
                            <Text variant="overline" tone="muted">
                                Associated Project
                            </Text>
                            <Text variant="bodyMedium">{indent.project?.name || "General indent"}</Text>
                        </View>
                        <View style={{ flex: 1, gap: 3 }}>
                            <Text variant="overline" tone="muted">
                                Requested Delivery
                            </Text>
                            <Text variant="bodyMedium">{fmtDate(indent.expectedDelivery, "PPP")}</Text>
                        </View>
                    </View>
                    {indent.task?.name ? (
                        <Text variant="small" tone="muted" style={{ paddingHorizontal: 16, paddingBottom: 14 }}>
                            Linked subtask: {indent.task.name}
                        </Text>
                    ) : null}
                    {indent.description ? (
                        <Text variant="body" tone="muted" style={{ paddingHorizontal: 16, paddingBottom: 14 }}>
                            {indent.description}
                        </Text>
                    ) : null}
                </Card>

                {/* Requested materials */}
                <Card padded={false}>
                    <CardHeader title="Requested Materials & Quantities" icon={Package} iconColor={colors.primaryInk} />
                    {(indent.lineItems ?? []).length === 0 ? (
                        <Text variant="small" tone="muted" center style={{ padding: 20 }}>
                            No materials found in this indent.
                        </Text>
                    ) : (
                        indent.lineItems.map((item: any) => (
                            <View key={item.id} style={[styles.item, { borderTopColor: colors.border }]}>
                                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                                    <View style={{ flex: 1, gap: 3 }}>
                                        <Text variant="bodyMedium" weight="semibold">
                                            {item.materialName}
                                        </Text>
                                        {item.specifications ? (
                                            <Text variant="caption" tone="muted">
                                                {item.specifications}
                                            </Text>
                                        ) : null}
                                    </View>
                                    <Badge label={MATERIAL_STATUS_LABELS[item.status] ?? item.status} size="xs" variant="muted" />
                                </View>
                                <View style={{ flexDirection: "row", gap: 12, flexWrap: "wrap" }}>
                                    <Pair label="Qty" value={`${item.quantity} ${item.unit}`} />
                                    <Pair label="Approx. Rate" value={formatRate(item.estimatedUnitPrice)} />
                                    {!rules.canEnterFinalRates ? <Pair label="Final Rate" value={formatRate(item.finalUnitPrice)} /> : null}
                                </View>
                                {rules.canEnterFinalRates ? (
                                    <Input
                                        label="Final rate (₹)"
                                        keyboardType="decimal-pad"
                                        placeholder="Enter final rate"
                                        value={finalRates[item.id] ?? ""}
                                        onChangeText={(v) => setFinalRates((c) => ({ ...c, [item.id]: v }))}
                                    />
                                ) : null}
                                {rules.canEdit || rules.canRevise ? (
                                    <View style={{ flexDirection: "row", gap: 8 }}>
                                        <Button size="sm" variant="outline" icon={Edit} title={rules.canRevise ? "Revise" : "Edit"} onPress={() => setEditingItem(item)} />
                                        {rules.canEdit ? <Button size="sm" variant="destructiveOutline" icon={Trash2} title="Remove" onPress={() => removeItem(item)} /> : null}
                                    </View>
                                ) : null}
                            </View>
                        ))
                    )}
                    {rules.canEdit ? (
                        <Pressable onPress={() => setAddingItem(true)} style={[styles.addRow, { borderTopColor: colors.border }]}>
                            <Plus size={16} color={colors.primaryInk} />
                            <Text variant="label" tone="primary">
                                Add material
                            </Text>
                        </Pressable>
                    ) : null}
                    {rules.canEnterFinalRates ? (
                        <View style={[styles.finalBox, { backgroundColor: tint(tone("warning"), 0.1), borderTopColor: colors.border }]}>
                            <Text variant="small" color={tone("warning")}>
                                Enter the least manually negotiated rate for every material, then send the rates to your manager.
                            </Text>
                            <Select
                                label="Supplier / Contractor (optional)"
                                value={selectedVendorId}
                                onChange={setSelectedVendorId}
                                allowClear
                                options={(vendors.data ?? []).map((v: any) => ({ value: v.id, label: vendorDisplayName(v), description: v.vendorId }))}
                                placeholder="No supplier / contractor selected"
                                searchable
                            />
                            <Button icon={FileCheck} title={indent.status === "REJECTED" ? "Resubmit Price" : "Submit Price"} loading={busy} onPress={submitFinal} />
                        </View>
                    ) : null}
                </Card>

                {pctCharges.length || flatCharges.length ? (
                    <Card padded={false}>
                        <CardHeader title="Additional Charges" icon={ReceiptText} />
                        <View style={{ padding: 16, gap: 8 }}>
                            <Row label="Material subtotal" value={formatRate(subtotal)} />
                            {pctCharges.map((c) => (
                                <Row key={c.label} label={`${c.label} (${c.pct}%)`} value={formatRate(subtotal * (c.pct / 100))} />
                            ))}
                            {flatCharges.map((c) => (
                                <Row key={c.label} label={c.label} value={formatRate(c.amount)} />
                            ))}
                            <View style={{ height: 1, backgroundColor: colors.border }} />
                            <Row label="Estimated total" value={formatRate(subtotal + chargeTotal)} bold />
                        </View>
                    </Card>
                ) : null}

                <Card padded={false}>
                    <CardHeader title="Requested By" icon={User} />
                    <View style={{ padding: 16, flexDirection: "row", alignItems: "center", gap: 12 }}>
                        <Avatar name={displayName(indent.requestedBy?.user)} size={36} />
                        <View>
                            <Text variant="bodyMedium" weight="semibold">
                                {displayName(indent.requestedBy?.user)}
                            </Text>
                            <Text variant="caption" tone="muted">
                                Raised {fmtDate(indent.createdAt)}
                            </Text>
                        </View>
                    </View>
                </Card>

                <Card padded={false}>
                    <CardHeader title="Approvals" icon={Check} />
                    {approvalRows.map((row) => (
                        <View key={row.key} style={[styles.approval, { borderTopColor: colors.border }]}>
                            <View style={{ flex: 1 }}>
                                <Text variant="caption" tone="muted">
                                    {row.stage}
                                </Text>
                                <Text variant="bodyMedium">{row.person}</Text>
                            </View>
                            <ApprovalBadge state={row.state} />
                        </View>
                    ))}
                </Card>
            </ScreenBody>

            <ActionMenu
                open={menu}
                onClose={() => setMenu(false)}
                title={indent.name}
                actions={[
                    { label: "Edit Indent", icon: Pencil, hidden: !rules.canEditIndent, onPress: () => setEditOpen(true) },
                    { label: "Cancel Indent", icon: Ban, hidden: !rules.canCancel, onPress: cancel },
                    { label: "Delete", icon: Trash2, destructive: true, hidden: !rules.canDeleteIndent, onPress: remove },
                ]}
            />
            {editOpen ? <EditIndentSheet indent={indent} canEditCharges={rules.canEdit} onClose={() => setEditOpen(false)} onSaved={refresh} /> : null}
            {editingItem || addingItem ? (
                <LineItemSheet
                    indent={indent}
                    item={editingItem}
                    revisionStage={rules.revisionStage}
                    onClose={() => {
                        setEditingItem(null);
                        setAddingItem(false);
                    }}
                    onSaved={refresh}
                />
            ) : null}
        </Screen>
    );
}

function Pair({ label, value }: { label: string; value: string }) {
    return (
        <View style={{ gap: 2 }}>
            <Text variant="overline" tone="muted">
                {label}
            </Text>
            <Text variant="mono">{value}</Text>
        </View>
    );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
    return (
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text variant={bold ? "bodyMedium" : "small"} tone={bold ? "default" : "muted"} weight={bold ? "bold" : undefined}>
                {label}
            </Text>
            <Text variant="mono" weight={bold ? "bold" : "semibold"}>
                {value}
            </Text>
        </View>
    );
}

function ApprovalBadge({ state }: { state: ApprovalState }) {
    const map = {
        APPROVED: { label: "Approved", color: tone("success") },
        PENDING: { label: "Pending", color: tone("warning") },
        WAITING: { label: "Not yet due", color: tone("neutral") },
        REJECTED: { label: "Rejected", color: tone("danger") },
    }[state];
    return <Badge label={map.label} color={map.color} size="xs" />;
}

/** The web's "Edit Indent" dialog: name, description, delivery, charges, owners. */
function EditIndentSheet({ indent, canEditCharges, onClose, onSaved }: { indent: any; canEditCharges: boolean; onClose: () => void; onSaved: () => void }) {
    const { workspaceId } = useWorkspace();
    const slim = useQuery({ queryKey: qk.membersSlim(workspaceId), queryFn: () => workspacesApi.membersSlim(workspaceId) });
    const owners = (slim.data ?? []).filter((m: any) => ["OWNER", "ADMIN"].includes(m.workspaceRole));
    const [name, setName] = useState(indent.name ?? "");
    const [description, setDescription] = useState(indent.description ?? "");
    const [delivery, setDelivery] = useState<Date | null>(indent.expectedDelivery ? new Date(indent.expectedDelivery) : null);
    const [tax, setTax] = useState(indent.taxPercent != null ? String(indent.taxPercent) : "");
    const [excise, setExcise] = useState(indent.exciseDutyPercent != null ? String(indent.exciseDutyPercent) : "");
    const [vat, setVat] = useState(indent.vatPercent != null ? String(indent.vatPercent) : "");
    const [transport, setTransport] = useState(indent.transportCharge != null ? String(indent.transportCharge / 100) : "");
    const [labour, setLabour] = useState(indent.labourCharge != null ? String(indent.labourCharge / 100) : "");
    const [approverIds, setApproverIds] = useState<string[]>(indent.approverIds ?? []);

    const save = useMutation({
        mutationFn: () => {
            if (!name.trim()) throw new Error("Indent name is required");
            if (indent.status !== "APPROVED" && !approverIds.length) throw new Error("Select at least one owner for approval");
            for (const [label, v] of [["Tax", tax], ["Excise duty", excise], ["VAT", vat]] as const) {
                const n = Number(v);
                if (v !== "" && (!Number.isFinite(n) || n < 0 || n > 100)) throw new Error(`${label} must be between 0% and 100%`);
            }
            return indentsApi.update(workspaceId, indent.id, {
                name: name.trim(),
                description: description.trim() || null,
                expectedDelivery: delivery ? delivery.toISOString() : null,
                ...(canEditCharges
                    ? {
                          taxPercent: tax === "" ? null : Number(tax),
                          exciseDutyPercent: excise === "" ? null : Number(excise),
                          vatPercent: vat === "" ? null : Number(vat),
                          transportCharge: transport === "" ? null : Math.round(Number(transport) * 100),
                          labourCharge: labour === "" ? null : Math.round(Number(labour) * 100),
                      }
                    : {}),
                ...(indent.status !== "APPROVED" ? { approverIds } : {}),
            });
        },
        onSuccess: () => {
            toast.success("Indent updated");
            onSaved();
            onClose();
        },
        onError: (e) => toast.fromError(e, "Failed to update indent"),
    });

    return (
        <Sheet
            open
            onClose={onClose}
            title="Edit Indent"
            description="Materials and rates are edited in the list."
            footer={
                <>
                    <Button title="Cancel" variant="ghost" style={{ flex: 1 }} onPress={onClose} />
                    <Button icon={Save} title="Save Changes" style={{ flex: 1.4 }} loading={save.isPending} onPress={() => save.mutate()} />
                </>
            }
        >
            <Input label="Name" value={name} onChangeText={setName} />
            <Input label="Description" multiline value={description} onChangeText={setDescription} />
            <DateField label="Requested Delivery Date" value={delivery} onChange={setDelivery} clearable />
            <View style={{ flexDirection: "row", gap: 8 }}>
                <Input label="Tax (%)" containerStyle={{ flex: 1 }} keyboardType="decimal-pad" placeholder="Optional" value={tax} onChangeText={setTax} editable={canEditCharges} />
                <Input label="Excise (%)" containerStyle={{ flex: 1 }} keyboardType="decimal-pad" placeholder="Optional" value={excise} onChangeText={setExcise} editable={canEditCharges} />
                <Input label="VAT (%)" containerStyle={{ flex: 1 }} keyboardType="decimal-pad" placeholder="Optional" value={vat} onChangeText={setVat} editable={canEditCharges} />
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
                <Input label="Transportation (₹)" containerStyle={{ flex: 1 }} keyboardType="decimal-pad" placeholder="Optional" value={transport} onChangeText={setTransport} editable={canEditCharges} />
                <Input label="Labour (₹)" containerStyle={{ flex: 1 }} keyboardType="decimal-pad" placeholder="Optional" value={labour} onChangeText={setLabour} editable={canEditCharges} />
            </View>
            {indent.status !== "APPROVED" ? (
                <MultiSelect
                    label="Owners for approval"
                    values={approverIds}
                    onChange={setApproverIds}
                    options={owners.map((o: any) => ({ value: o.id, label: displayName(o.user ?? o) }))}
                    placeholder={slim.isLoading ? "Loading owners…" : "Select owners"}
                />
            ) : null}
            {indent.status !== "APPROVED" ? (
                <Text variant="caption" tone="muted">
                    Dropping an owner also drops the approval they had already given.
                </Text>
            ) : null}
        </Sheet>
    );
}

/** Add / edit / revise one line item. Reviewers revise only quantity and the stage's rate. */
function LineItemSheet({ indent, item, revisionStage, onClose, onSaved }: { indent: any; item: any | null; revisionStage: "ESTIMATE" | "FINAL" | null; onClose: () => void; onSaved: () => void }) {
    const { workspaceId } = useWorkspace();
    const revise = !!item && revisionStage !== null;
    const [name, setName] = useState(item?.materialName ?? "");
    const [quantity, setQuantity] = useState(item ? String(item.quantity) : "1");
    const [unit, setUnit] = useState(item?.unit ?? "pcs");
    const [specs, setSpecs] = useState(item?.specifications ?? "");
    const [estimate, setEstimate] = useState(item?.estimatedUnitPrice ? String(item.estimatedUnitPrice / 100) : "");
    const [final, setFinal] = useState(item?.finalUnitPrice ? String(item.finalUnitPrice / 100) : "");
    const catalog = useQuery({ queryKey: qk.catalog(workspaceId), queryFn: () => materialsApi.list(workspaceId).catch(() => []) });
    const units = useQuery({ queryKey: qk.units(workspaceId), queryFn: () => indentsApi.units(workspaceId).catch(() => []) });
    const unitOptions = (units.data?.length ? units.data : FALLBACK_UNITS).map((u: any) => ({ value: u.abbreviation, label: `${u.abbreviation} (${u.name})` }));
    const toPaise = (v: string) => (v ? Math.round(Number(v) * 100) : undefined);

    const save = useMutation({
        mutationFn: () => {
            if (!name.trim()) throw new Error("Material name is required");
            if (!(Number(quantity) > 0)) throw new Error("Quantity must be greater than 0");
            if (!item) {
                return indentsApi.addItem(workspaceId, indent.id, { materialName: name.trim(), quantity: Number(quantity), unit: unit.trim(), specifications: specs.trim() || undefined, estimatedUnitPrice: toPaise(estimate) });
            }
            const payload = revise
                ? { quantity: Number(quantity), ...(revisionStage === "FINAL" ? { finalUnitPrice: toPaise(final) } : { estimatedUnitPrice: toPaise(estimate) }) }
                : { materialName: name.trim(), quantity: Number(quantity), unit: unit.trim(), specifications: specs.trim() || null, estimatedUnitPrice: toPaise(estimate) };
            return indentsApi.updateItem(workspaceId, indent.id, item.id, payload);
        },
        onSuccess: () => {
            toast.success(item ? "Material updated" : "Material added to indent");
            onSaved();
            onClose();
        },
        onError: (e) => toast.fromError(e),
    });

    return (
        <Sheet
            open
            onClose={onClose}
            title={!item ? "Add material" : revise ? "Revise quantity / rate" : "Edit material"}
            footer={
                <>
                    <Button title="Cancel" variant="outline" style={{ flex: 1 }} onPress={onClose} />
                    <Button title={item ? "Save" : "Add"} style={{ flex: 1 }} loading={save.isPending} onPress={() => save.mutate()} />
                </>
            }
        >
            {!revise ? (
                <>
                    <Select
                        label="From the material catalogue"
                        value={null}
                        onChange={(v) => {
                            if (!v) return;
                            setName(v);
                            const match = (catalog.data ?? []).find((c: any) => c.name === v);
                            if (match?.defaultUnit?.abbreviation) setUnit(match.defaultUnit.abbreviation);
                        }}
                        options={(catalog.data ?? []).map((c: any) => ({ value: c.name, label: c.name, description: c.lastPrice ? `Last ${formatRate(c.lastPrice)}` : undefined }))}
                        searchable
                        placeholder="Pick a remembered material…"
                    />
                    <Input label="Material Name" required value={name} onChangeText={setName} placeholder="Add new material name…" />
                </>
            ) : (
                <Text variant="title">{item.materialName}</Text>
            )}
            <View style={{ flexDirection: "row", gap: 10 }}>
                <Input label="Quantity" containerStyle={{ flex: 1 }} keyboardType="number-pad" value={quantity} onChangeText={setQuantity} />
                {!revise ? (
                    <View style={{ flex: 1 }}>
                        <Select label="Unit" value={unit} onChange={(v) => v && setUnit(v)} options={unitOptions.some((u: any) => u.value === unit) ? unitOptions : [{ value: unit, label: unit }, ...unitOptions]} />
                    </View>
                ) : null}
            </View>
            {revisionStage !== "FINAL" || !revise ? <Input label="Approx. rate (₹)" keyboardType="decimal-pad" placeholder="Approx. rate" value={estimate} onChangeText={setEstimate} /> : null}
            {revise && revisionStage === "FINAL" ? <Input label="Final rate (₹)" keyboardType="decimal-pad" placeholder="Final rate" value={final} onChangeText={setFinal} /> : null}
            {!revise ? <Input label="Description" multiline placeholder="Description (optional)…" value={specs} onChangeText={setSpecs} /> : null}
        </Sheet>
    );
}

const styles = StyleSheet.create({
    item: { padding: 14, gap: 10, borderTopWidth: 1 },
    addRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14, borderTopWidth: 1 },
    finalBox: { padding: 14, gap: 12, borderTopWidth: 1, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
    approval: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 11, borderTopWidth: 1 },
});
