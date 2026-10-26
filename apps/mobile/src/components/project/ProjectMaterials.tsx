import { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes, Pencil, Plus, Trash2 } from "lucide-react-native";
import { projectsApi } from "../../api/projects";
import { indentsApi, materialsApi } from "../../api/procurement";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { qk } from "../../lib/query";
import { FALLBACK_UNITS } from "../../lib/constants";
import { displayName } from "../../lib/format";
import { toast } from "../../lib/toast";
import { useTheme } from "../../theme/ThemeProvider";
import { radius } from "../../theme/tokens";
import { Button, Card, EmptyState, Input, ListSkeleton, SearchBar, Select, Sheet, StatusBadge, Tabs, Text, confirm } from "../ui";

type Item = { id: string; subtaskId: string | null; materialName: string; unit: string; quantity: number; notes: string | null; addedBy?: any; subtaskNameSnapshot?: string | null; parentTaskNameSnapshot?: string | null };

/** p/[slug]/materials: procurement subtasks with their planned materials, or a per-material summary. */
export function ProjectMaterials({ projectId }: { projectId: string }) {
    const { colors } = useTheme();
    const qc = useQueryClient();
    const { workspaceId } = useWorkspace();
    const [mode, setMode] = useState<"subtasks" | "summary">("subtasks");
    const [search, setSearch] = useState("");
    const [editor, setEditor] = useState<{ subtaskId: string | null; item?: Item } | null>(null);

    const data = useQuery({ queryKey: qk.projectMaterials(workspaceId, projectId), queryFn: () => projectsApi.materials(workspaceId, projectId), enabled: !!workspaceId });
    const invalidate = () => qc.invalidateQueries({ queryKey: qk.projectMaterials(workspaceId, projectId) });

    const groups = useMemo(() => {
        const items: Item[] = data.data?.materialItems ?? [];
        const q = search.trim().toLowerCase();
        const subtasks = (data.data?.subtasks ?? []).map((s: any) => ({ ...s, materials: items.filter((m) => m.subtaskId === s.id) }));
        const orphans = items.filter((m) => !m.subtaskId || !subtasks.some((s: any) => s.id === m.subtaskId));
        const all = [...subtasks, ...(orphans.length ? [{ id: "__none__", name: "Unlinked materials", status: null, parentTask: null, materials: orphans }] : [])];
        if (!q) return all;
        return all
            .map((s: any) => (s.name.toLowerCase().includes(q) ? s : { ...s, materials: s.materials.filter((m: Item) => m.materialName.toLowerCase().includes(q)) }))
            .filter((s: any) => s.name.toLowerCase().includes(q) || s.materials.length > 0);
    }, [data.data, search]);

    const summary = useMemo(() => {
        const map = new Map<string, { name: string; unit: string; total: number; usages: number }>();
        for (const m of (data.data?.materialItems ?? []) as Item[]) {
            const key = `${m.materialName.toLowerCase().trim()}|${m.unit}`;
            const row = map.get(key) ?? { name: m.materialName, unit: m.unit, total: 0, usages: 0 };
            row.total += Number(m.quantity) || 0;
            row.usages += 1;
            map.set(key, row);
        }
        const q = search.trim().toLowerCase();
        return [...map.values()].filter((r) => !q || r.name.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name));
    }, [data.data, search]);

    const remove = useMutation({
        mutationFn: (id: string) => projectsApi.deleteMaterial(workspaceId, projectId, id),
        onSuccess: () => {
            toast.success("Material removed");
            invalidate();
        },
        onError: (e) => toast.fromError(e, "Failed to delete material"),
    });

    const header = (
        <View style={{ gap: 12, marginBottom: 6 }}>
            <Tabs scrollable={false} value={mode} onChange={setMode} items={[{ key: "subtasks", label: "By Subtask" }, { key: "summary", label: "Summary" }]} />
            <SearchBar value={search} onChangeText={setSearch} placeholder="Search materials or subtasks…" />
        </View>
    );

    return (
        <>
            {mode === "summary" ? (
                <FlatList
                    data={summary}
                    keyExtractor={(r) => `${r.name}|${r.unit}`}
                    contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 60 }}
                    ListHeaderComponent={header}
                    refreshControl={<RefreshControl refreshing={data.isRefetching} onRefresh={() => data.refetch()} tintColor={colors.primaryInk} />}
                    ListEmptyComponent={data.isLoading ? <ListSkeleton rows={4} avatar={false} /> : <EmptyState icon={Boxes} title="No materials planned yet" compact />}
                    renderItem={({ item }) => (
                        <Card style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14 }}>
                            <View style={{ flex: 1 }}>
                                <Text variant="bodyMedium">{item.name}</Text>
                                <Text variant="caption" tone="muted">
                                    Used in {item.usages} subtask{item.usages === 1 ? "" : "s"}
                                </Text>
                            </View>
                            <Text variant="title">
                                {item.total} <Text tone="muted">{item.unit}</Text>
                            </Text>
                        </Card>
                    )}
                />
            ) : (
                <FlatList
                    data={groups}
                    keyExtractor={(g: any) => g.id}
                    contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 60 }}
                    ListHeaderComponent={header}
                    refreshControl={<RefreshControl refreshing={data.isRefetching} onRefresh={() => data.refetch()} tintColor={colors.primaryInk} />}
                    ListEmptyComponent={
                        data.isLoading ? (
                            <ListSkeleton rows={4} avatar={false} />
                        ) : (
                            <EmptyState icon={Boxes} title="No material schedules or tasks found" description="Subtasks tagged for procurement appear here so you can plan their materials." compact />
                        )
                    }
                    renderItem={({ item: group }: { item: any }) => (
                        <Card padded={false}>
                            <View style={[styles.groupHead, { borderBottomColor: colors.border }]}>
                                <View style={{ flex: 1, gap: 3 }}>
                                    {group.parentTask?.name ? (
                                        <Text variant="caption" tone="muted">
                                            {group.parentTask.name}
                                        </Text>
                                    ) : null}
                                    <Text variant="title">{group.name}</Text>
                                    {group.status ? <StatusBadge status={group.status} size="xs" /> : null}
                                </View>
                                {group.id !== "__none__" ? <Button size="sm" variant="outline" icon={Plus} title="Add" onPress={() => setEditor({ subtaskId: group.id })} /> : null}
                            </View>
                            {group.materials.length === 0 ? (
                                <Text variant="small" tone="muted" style={{ padding: 14, fontStyle: "italic" }}>
                                    No materials planned
                                </Text>
                            ) : (
                                group.materials.map((m: Item) => (
                                    <View key={m.id} style={[styles.itemRow, { borderBottomColor: colors.border }]}>
                                        <View style={{ flex: 1, gap: 2 }}>
                                            <Text variant="bodyMedium">{m.materialName}</Text>
                                            {m.notes ? (
                                                <Text variant="caption" tone="muted" numberOfLines={2}>
                                                    {m.notes}
                                                </Text>
                                            ) : null}
                                            <Text variant="caption" tone="muted">
                                                Added by {displayName(m.addedBy?.user)}
                                            </Text>
                                        </View>
                                        <Text variant="bodyMedium">
                                            {m.quantity} <Text tone="muted">{m.unit}</Text>
                                        </Text>
                                        <Pressable hitSlop={8} onPress={() => setEditor({ subtaskId: m.subtaskId, item: m })} style={{ padding: 6 }}>
                                            <Pencil size={15} color={colors.mutedForeground} />
                                        </Pressable>
                                        <Pressable
                                            hitSlop={8}
                                            style={{ padding: 6 }}
                                            onPress={async () => {
                                                if (await confirm({ title: `Remove ${m.materialName}?`, confirmLabel: "Remove", destructive: true })) remove.mutate(m.id);
                                            }}
                                        >
                                            <Trash2 size={15} color={colors.destructive} />
                                        </Pressable>
                                    </View>
                                ))
                            )}
                        </Card>
                    )}
                />
            )}
            {editor ? <MaterialEditor projectId={projectId} subtaskId={editor.subtaskId} item={editor.item} onClose={() => setEditor(null)} onSaved={invalidate} /> : null}
        </>
    );
}

function MaterialEditor({ projectId, subtaskId, item, onClose, onSaved }: { projectId: string; subtaskId: string | null; item?: Item; onClose: () => void; onSaved: () => void }) {
    const { workspaceId } = useWorkspace();
    const [name, setName] = useState(item?.materialName ?? "");
    const [unit, setUnit] = useState(item?.unit ?? "pcs");
    const [quantity, setQuantity] = useState(item ? String(item.quantity) : "");
    const [notes, setNotes] = useState(item?.notes ?? "");
    const catalog = useQuery({ queryKey: qk.catalog(workspaceId), queryFn: () => materialsApi.list(workspaceId).catch(() => []) });
    const units = useQuery({ queryKey: qk.units(workspaceId), queryFn: () => indentsApi.units(workspaceId).catch(() => []) });
    const unitOptions = (units.data?.length ? units.data : FALLBACK_UNITS).map((u: any) => ({ value: u.abbreviation, label: `${u.abbreviation} (${u.name})` }));

    const save = useMutation({
        mutationFn: () => {
            const qty = Number(quantity);
            if (!name.trim()) throw new Error("Material name is required");
            if (!(qty > 0)) throw new Error("Quantity must be greater than 0");
            const body = { subtaskId, materialName: name.trim(), unit, quantity: qty, notes: notes.trim() || null };
            return item ? projectsApi.updateMaterial(workspaceId, projectId, item.id, body) : projectsApi.addMaterial(workspaceId, projectId, body);
        },
        onSuccess: () => {
            toast.success(item ? "Material updated" : "Material added");
            onSaved();
            onClose();
        },
        onError: (e) => toast.fromError(e),
    });

    return (
        <Sheet
            open
            onClose={onClose}
            title={item ? "Edit material" : "Add material"}
            footer={
                <>
                    <Button title="Cancel" variant="outline" style={{ flex: 1 }} onPress={onClose} />
                    <Button title={item ? "Save" : "Add"} style={{ flex: 1 }} loading={save.isPending} onPress={() => save.mutate()} />
                </>
            }
        >
            <Select
                label="Material"
                value={name || null}
                onChange={(v) => {
                    setName(v ?? "");
                    const match = (catalog.data ?? []).find((c: any) => c.name === v);
                    if (match?.defaultUnit?.abbreviation) setUnit(match.defaultUnit.abbreviation);
                }}
                options={(catalog.data ?? []).map((c: any) => ({ value: c.name, label: c.name, description: c.materialId ?? undefined }))}
                searchable
                placeholder="Select material…"
            />
            <Input label="Or type a material name" value={name} onChangeText={setName} placeholder="e.g. 12mm plywood" />
            <View style={{ flexDirection: "row", gap: 10 }}>
                <Input label="Quantity" containerStyle={{ flex: 1 }} keyboardType="decimal-pad" value={quantity} onChangeText={setQuantity} placeholder="0.00" />
                <View style={{ flex: 1 }}>
                    <Select label="Unit" value={unit} onChange={(v) => v && setUnit(v)} options={unitOptions} />
                </View>
            </View>
            <Input label="Specifications / Notes" multiline value={notes} onChangeText={setNotes} placeholder="Optional" />
        </Sheet>
    );
}

const styles = StyleSheet.create({
    groupHead: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderBottomWidth: 1 },
    itemRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1 },
});
