import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, Plus, Trash2 } from "lucide-react-native";
import { indentsApi, materialsApi } from "../../api/procurement";
import { workspacesApi } from "../../api/workspaces";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { qk } from "../../lib/query";
import { FALLBACK_UNITS } from "../../lib/constants";
import { displayName, fmtDate, formatRate } from "../../lib/format";
import { toast } from "../../lib/toast";
import { useTheme } from "../../theme/ThemeProvider";
import { fonts, radius } from "../../theme/tokens";
import { Button, Card, CardHeader, DateField, Input, MultiSelect, Select, Text } from "../../components/ui";
import { BottomBar, Screen, ScreenBody, ScreenHeader } from "../../components/layout/Screen";
import type { RootStackParamList } from "../../navigation/types";

type Row = { materialName: string; unit: string; quantity: string; unitPrice: string; specifications: string };
const blankRow = (): Row => ({ materialName: "", unit: "pcs", quantity: "1", unitPrice: "", specifications: "" });

/**
 * create-indent-form.tsx: from the workspace hub ("Is this related to a
 * project?") or from inside a project / subtask, where the project is locked.
 */
export function IndentFormScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, "IndentForm">) {
    const lockedProjectId = route.params?.projectId;
    const presetTaskId = route.params?.taskId;
    const raisedInProject = !!route.params?.raisedInProject;
    const { colors } = useTheme();
    const qc = useQueryClient();
    const { workspaceId, layout } = useWorkspace();

    const [isProjectRelated, setIsProjectRelated] = useState(true);
    const [projectId, setProjectId] = useState<string | null>(lockedProjectId ?? null);
    const [taskId, setTaskId] = useState<string | null>(presetTaskId ?? null);
    const [expectedDelivery, setExpectedDelivery] = useState<Date | null>(null);
    const [description, setDescription] = useState("");
    const [approverIds, setApproverIds] = useState<string[]>([]);
    const [rows, setRows] = useState<Row[]>([blankRow()]);
    const [tax, setTax] = useState("");
    const [excise, setExcise] = useState("");
    const [vat, setVat] = useState("");
    const [transport, setTransport] = useState("");
    const [labour, setLabour] = useState("");

    const needsProject = !!lockedProjectId || raisedInProject || isProjectRelated;
    const projects = useQuery({ queryKey: ["procurable-projects", workspaceId], queryFn: () => indentsApi.procurableProjects(workspaceId).catch(() => []), enabled: !!workspaceId && !lockedProjectId });
    const tasks = useQuery({ queryKey: ["indentable-tasks", projectId], queryFn: () => indentsApi.procurableTasks(workspaceId, projectId!), enabled: !!projectId && needsProject });
    const units = useQuery({ queryKey: qk.units(workspaceId), queryFn: () => indentsApi.units(workspaceId).catch(() => []) });
    const catalog = useQuery({ queryKey: qk.catalog(workspaceId), queryFn: () => materialsApi.list(workspaceId).catch(() => []) });
    const slim = useQuery({ queryKey: qk.membersSlim(workspaceId), queryFn: () => workspacesApi.membersSlim(workspaceId) });
    const owners = (slim.data ?? []).filter((m: any) => ["OWNER", "ADMIN"].includes(m.workspaceRole));

    // Auto-fill the delivery date from the linked subtask's due date.
    useEffect(() => {
        const t = (tasks.data ?? []).find((x: any) => x.id === taskId);
        if (t?.dueDate && !expectedDelivery) setExpectedDelivery(new Date(t.dueDate));
    }, [taskId, tasks.data]); // eslint-disable-line react-hooks/exhaustive-deps

    const unitOptions = (units.data?.length ? units.data : FALLBACK_UNITS).map((u: any) => ({ value: u.abbreviation, label: `${u.abbreviation} (${u.name})` }));
    const projectOptions = (projects.data?.length ? projects.data : layout?.projects ?? []).map((p: any) => ({ value: p.id, label: p.name }));
    const lockedName = layout?.projects.find((p) => p.id === lockedProjectId)?.name;

    const setRow = (i: number, patch: Partial<Row>) => setRows((cur) => cur.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
    const subtotal = useMemo(() => rows.reduce((t, r) => t + (Number(r.unitPrice) || 0) * (Number(r.quantity) || 0) * 100, 0), [rows]);

    const save = useMutation({
        mutationFn: () => {
            if (needsProject && !projectId) throw new Error("Please select a project");
            if (!approverIds.length) throw new Error("Select at least one owner for approval");
            for (const [label, v] of [["Tax", tax], ["Excise duty", excise], ["VAT", vat]] as const) {
                const n = Number(v);
                if (v !== "" && (!Number.isFinite(n) || n < 0 || n > 100)) throw new Error(`${label} must be between 0% and 100%`);
            }
            for (const [label, v] of [["Transportation charge", transport], ["Labour charge", labour]] as const) {
                const n = Number(v);
                if (v !== "" && (!Number.isFinite(n) || n < 0)) throw new Error(`${label} must be a positive amount`);
            }
            rows.forEach((r, i) => {
                if (!r.materialName.trim()) throw new Error(`Please enter material name for item ${i + 1}`);
                if (!r.unit.trim()) throw new Error(`Please enter unit for item ${i + 1}`);
                if (!(Number(r.quantity) > 0)) throw new Error(`Quantity must be greater than 0 for item ${i + 1}`);
            });
            const pct = (v: string) => (v === "" ? undefined : Number(v));
            const amt = (v: string) => (v === "" ? undefined : Math.round(Number(v) * 100));
            return indentsApi.create({
                workspaceId,
                projectId: needsProject ? projectId : undefined,
                taskId: needsProject ? taskId ?? undefined : undefined,
                raisedInProject,
                description: description.trim() || undefined,
                expectedDelivery: expectedDelivery?.toISOString(),
                taxPercent: pct(tax),
                exciseDutyPercent: pct(excise),
                vatPercent: pct(vat),
                transportCharge: amt(transport),
                labourCharge: amt(labour),
                approverIds,
                lineItems: rows.map((r) => ({
                    materialName: r.materialName.trim(),
                    unit: r.unit.trim(),
                    quantity: Math.ceil(Number(r.quantity)),
                    estimatedUnitPrice: r.unitPrice ? Math.round(Number(r.unitPrice) * 100) : undefined,
                    specifications: r.specifications.trim() || undefined,
                })),
            });
        },
        onSuccess: (created: any) => {
            toast.success("Indent created successfully");
            qc.invalidateQueries({ queryKey: qk.indents(workspaceId) });
            navigation.goBack();
            if (created?.id) navigation.navigate("IndentDetail", { indentId: created.id });
        },
        onError: (e) => toast.fromError(e, "Failed to create indent"),
    });

    return (
        <Screen>
            <ScreenHeader title="Create Indent" back showActions={false} />
            <ScreenBody
                footer={
                    <BottomBar>
                        <Button title="Cancel" variant="outline" style={{ flex: 1 }} onPress={() => navigation.goBack()} />
                        <Button title="Create Indent" style={{ flex: 1.4 }} loading={save.isPending} onPress={() => save.mutate()} />
                    </BottomBar>
                }
            >
                <Card padded={false}>
                    <CardHeader title="Indent Details" />
                    <View style={{ padding: 16, gap: 14 }}>
                        {!lockedProjectId && !raisedInProject ? (
                            <View style={{ gap: 6 }}>
                                <Text variant="overline" tone="muted">
                                    Is this related to a project? <Text variant="overline" tone="destructive">*</Text>
                                </Text>
                                <View style={{ flexDirection: "row", gap: 8 }}>
                                    {[true, false].map((v) => (
                                        <Pressable
                                            key={String(v)}
                                            onPress={() => {
                                                setIsProjectRelated(v);
                                                if (!v) {
                                                    setProjectId(null);
                                                    setTaskId(null);
                                                }
                                            }}
                                            style={[styles.yesNo, { borderColor: isProjectRelated === v ? colors.primaryInk : colors.input, backgroundColor: isProjectRelated === v ? colors.accent : colors.card }]}
                                        >
                                            <Text style={{ fontFamily: fonts.semibold, fontSize: 13 }}>{v ? "Yes" : "No"}</Text>
                                        </Pressable>
                                    ))}
                                </View>
                                {!isProjectRelated ? (
                                    <Text variant="caption" tone="muted">
                                        Saved as a general indent. It appears in the workspace indent list only, not under any project.
                                    </Text>
                                ) : null}
                            </View>
                        ) : null}
                        {needsProject ? (
                            lockedProjectId ? (
                                <View style={{ gap: 6 }}>
                                    <Text variant="overline" tone="muted">
                                        Project
                                    </Text>
                                    <View style={[styles.locked, { borderColor: colors.border, backgroundColor: colors.muted }]}>
                                        <Text variant="bodyMedium" style={{ flex: 1 }}>
                                            {lockedName ?? "Selected Project"}
                                        </Text>
                                        <Lock size={13} color={colors.mutedForeground} />
                                    </View>
                                </View>
                            ) : (
                                <Select label="Project" required value={projectId} onChange={(v) => { setProjectId(v); setTaskId(null); }} options={projectOptions} searchable placeholder="Select a project" />
                            )
                        ) : null}
                        {needsProject && !presetTaskId && (tasks.data ?? []).length > 0 ? (
                            <Select
                                label="Link to Subtask"
                                value={taskId}
                                onChange={setTaskId}
                                allowClear
                                options={(tasks.data ?? []).map((t: any) => ({ value: t.id, label: t.name, description: t.dueDate ? `Due ${fmtDate(t.dueDate)}` : undefined }))}
                                placeholder="Optional"
                            />
                        ) : null}
                        <DateField label="Expected Delivery" value={expectedDelivery} onChange={setExpectedDelivery} minimumDate={new Date()} clearable />
                        <Input label="Description" multiline placeholder="Provide optional details or guidelines…" value={description} onChangeText={setDescription} />
                        <MultiSelect
                            label="Owners for approval"
                            required
                            values={approverIds}
                            onChange={setApproverIds}
                            options={owners.map((o: any) => ({ value: o.id, label: displayName(o.user ?? o) }))}
                            placeholder={approverIds.length ? `${approverIds.length} owner(s) selected` : "Select owners"}
                        />
                    </View>
                </Card>

                <Card padded={false}>
                    <CardHeader title="Materials" right={<Text variant="mono" tone="muted">{formatRate(subtotal)}</Text>} />
                    {rows.map((row, i) => (
                        <View key={i} style={[styles.row, { borderTopColor: colors.border }]}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                                <Text variant="label" tone="muted" style={{ flex: 1 }}>
                                    Item {i + 1}
                                </Text>
                                <Pressable disabled={rows.length === 1} hitSlop={8} onPress={() => setRows((c) => c.filter((_, idx) => idx !== i))} style={{ opacity: rows.length === 1 ? 0.3 : 1 }}>
                                    <Trash2 size={16} color={colors.destructive} />
                                </Pressable>
                            </View>
                            <Select
                                value={null}
                                onChange={(v) => {
                                    if (!v) return;
                                    const match = (catalog.data ?? []).find((c: any) => c.name === v);
                                    setRow(i, { materialName: v, ...(match?.defaultUnit?.abbreviation ? { unit: match.defaultUnit.abbreviation } : {}) });
                                }}
                                options={(catalog.data ?? []).map((c: any) => ({ value: c.name, label: c.name, description: c.lastPrice ? `Last ${formatRate(c.lastPrice)}` : undefined }))}
                                searchable
                                title="Material catalogue"
                                trigger={(open) => (
                                    <Pressable onPress={open}>
                                        <Text variant="label" tone="primary">
                                            Pick from catalogue
                                        </Text>
                                    </Pressable>
                                )}
                            />
                            <Input placeholder="Material name" value={row.materialName} onChangeText={(v) => setRow(i, { materialName: v })} />
                            <Input placeholder="Description (optional)" value={row.specifications} onChangeText={(v) => setRow(i, { specifications: v })} />
                            <View style={{ flexDirection: "row", gap: 8 }}>
                                <Input label="Qty" containerStyle={{ flex: 0.8 }} keyboardType="number-pad" placeholder="10" value={row.quantity} onChangeText={(v) => setRow(i, { quantity: v })} />
                                <View style={{ flex: 1.1 }}>
                                    <Select label="Unit" value={row.unit} onChange={(v) => v && setRow(i, { unit: v })} options={unitOptions} />
                                </View>
                                <Input label="Rate (₹)" containerStyle={{ flex: 1 }} keyboardType="decimal-pad" placeholder="0.00" value={row.unitPrice} onChangeText={(v) => setRow(i, { unitPrice: v })} />
                            </View>
                        </View>
                    ))}
                    <Pressable onPress={() => setRows((c) => [...c, blankRow()])} style={[styles.add, { borderTopColor: colors.border }]}>
                        <Plus size={16} color={colors.primaryInk} />
                        <Text variant="label" tone="primary">
                            Add material
                        </Text>
                    </Pressable>
                </Card>

                <Card padded={false}>
                    <CardHeader title="Optional Charges" />
                    <View style={{ padding: 16, gap: 12 }}>
                        <View style={{ flexDirection: "row", gap: 8 }}>
                            <Input label="Tax (%)" containerStyle={{ flex: 1 }} keyboardType="decimal-pad" placeholder="0.00" value={tax} onChangeText={setTax} />
                            <Input label="Excise (%)" containerStyle={{ flex: 1 }} keyboardType="decimal-pad" placeholder="0.00" value={excise} onChangeText={setExcise} />
                            <Input label="VAT (%)" containerStyle={{ flex: 1 }} keyboardType="decimal-pad" placeholder="0.00" value={vat} onChangeText={setVat} />
                        </View>
                        <View style={{ flexDirection: "row", gap: 8 }}>
                            <Input label="Transportation (₹)" containerStyle={{ flex: 1 }} keyboardType="decimal-pad" placeholder="0.00" value={transport} onChangeText={setTransport} />
                            <Input label="Labour (₹)" containerStyle={{ flex: 1 }} keyboardType="decimal-pad" placeholder="0.00" value={labour} onChangeText={setLabour} />
                        </View>
                    </View>
                </Card>
            </ScreenBody>
        </Screen>
    );
}

const styles = StyleSheet.create({
    yesNo: { flex: 1, height: 40, borderRadius: radius.sm, borderWidth: 1, alignItems: "center", justifyContent: "center" },
    locked: { flexDirection: "row", alignItems: "center", gap: 8, height: 46, paddingHorizontal: 14, borderRadius: radius.md, borderWidth: 1 },
    row: { padding: 14, gap: 10, borderTopWidth: 1 },
    add: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14, borderTopWidth: 1 },
});
