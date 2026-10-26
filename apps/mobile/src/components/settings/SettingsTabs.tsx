import { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, ChevronDown, ChevronRight, Lock, Monitor, Moon, Pencil, Plus, ShoppingCart, Sun, Tag, Trash2, Users } from "lucide-react-native";
import { adminApi } from "../../api/admin";
import { tagsApi } from "../../api/tags";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { qk } from "../../lib/query";
import { CAPABILITIES, DEFAULT_CAPABILITIES, WORKSPACE_ROLES, roleLabel, type Capability, type WorkspaceRole } from "../../lib/constants";
import { displayName, fmtDateTime } from "../../lib/format";
import { toast } from "../../lib/toast";
import { useTheme, type ThemePreference } from "../../theme/ThemeProvider";
import { radius } from "../../theme/tokens";
import { Avatar, Badge, Banner, Button, Card, CardHeader, EmptyState, ErrorState, Input, ListRow, ListSkeleton, SearchBar, Select, Sheet, Switch, SwitchRow, Tabs, Text, confirm } from "../ui";
import { ScreenBody } from "../layout/Screen";
import { tone } from "../../theme/tone";

/** settings/page.tsx — Appearance and the workspace Tags manager. */
export function GeneralTab() {
    const navigation = useNavigation<any>();
    const { preference, setPreference } = useTheme();
    const qc = useQueryClient();
    const { workspaceId, isAdmin } = useWorkspace();
    const tags = useQuery({ queryKey: qk.tags(workspaceId), queryFn: () => tagsApi.list(workspaceId), enabled: !!workspaceId });
    const [editor, setEditor] = useState<any | null | undefined>(undefined);
    const remove = useMutation({
        mutationFn: (id: string) => tagsApi.remove(workspaceId, id),
        onSuccess: () => {
            toast.success("Tag deleted");
            qc.invalidateQueries({ queryKey: qk.tags(workspaceId) });
            qc.invalidateQueries({ queryKey: qk.layout(workspaceId) });
        },
        onError: (e) => toast.fromError(e, "Failed to delete tag"),
    });

    return (
        <ScreenBody refreshing={tags.isRefetching} onRefresh={() => tags.refetch()}>
            <Card padded={false}>
                <CardHeader title="Appearance" icon={Sun} description="Choose how drava core looks on this device." />
                <View style={{ padding: 16 }}>
                    <Tabs
                        scrollable={false}
                        value={preference}
                        onChange={(p: ThemePreference) => setPreference(p)}
                        items={[
                            { key: "light", label: "Light", icon: Sun },
                            { key: "dark", label: "Dark", icon: Moon },
                            { key: "system", label: "System", icon: Monitor },
                        ]}
                    />
                </View>
            </Card>

            <Card padded={false}>
                <ListRow icon={Building2} label="Workspace information" description="Legal name, GST, address and contact details" onPress={() => navigation.navigate("WorkspaceInfo")} />
            </Card>

            <Card padded={false}>
                <CardHeader title="Tags" icon={Tag} description="Label tasks; procurement tags prompt an indent." right={isAdmin ? <Button size="sm" variant="ghost" icon={Plus} title="New" onPress={() => setEditor(null)} /> : null} />
                {tags.isLoading ? (
                    <View style={{ padding: 16 }}>
                        <ListSkeleton rows={3} avatar={false} />
                    </View>
                ) : !(tags.data ?? []).length ? (
                    <EmptyState title="No tags yet" compact />
                ) : (
                    (tags.data ?? []).map((t: any) => (
                        <View key={t.id} style={styles.tagRow}>
                            <Tag size={15} color={tone("neutral")} />
                            <Text variant="bodyMedium" style={{ flex: 1 }}>
                                {t.name}
                            </Text>
                            {t.requirePurchase ? <Badge label="Procurement" icon={ShoppingCart} size="xs" color="#b45309" /> : null}
                            {t._count?.tasks != null ? (
                                <Text variant="caption" tone="muted">
                                    {t._count.tasks}
                                </Text>
                            ) : null}
                            {isAdmin ? (
                                <>
                                    <Pressable hitSlop={8} onPress={() => setEditor(t)} style={{ padding: 4 }}>
                                        <Pencil size={15} color={tone("neutral")} />
                                    </Pressable>
                                    <Pressable
                                        hitSlop={8}
                                        style={{ padding: 4 }}
                                        onPress={async () => {
                                            if (await confirm({ title: `Delete tag "${t.name}"?`, message: "It's removed from every task that uses it.", confirmLabel: "Delete", destructive: true })) remove.mutate(t.id);
                                        }}
                                    >
                                        <Trash2 size={15} color={tone("danger")} />
                                    </Pressable>
                                </>
                            ) : null}
                        </View>
                    ))
                )}
            </Card>
            {editor !== undefined ? <TagSheet tag={editor} onClose={() => setEditor(undefined)} /> : null}
        </ScreenBody>
    );
}

function TagSheet({ tag, onClose }: { tag: any | null; onClose: () => void }) {
    const qc = useQueryClient();
    const { workspaceId } = useWorkspace();
    const [name, setName] = useState(tag?.name ?? "");
    const [requirePurchase, setRequirePurchase] = useState(!!tag?.requirePurchase);
    const save = useMutation({
        mutationFn: () => {
            if (!name.trim()) throw new Error("Tag name is required");
            return tag ? tagsApi.update(workspaceId, tag.id, { name: name.trim(), requirePurchase }) : tagsApi.create(workspaceId, name.trim(), requirePurchase);
        },
        onSuccess: () => {
            toast.success(tag ? "Tag updated" : "Tag created");
            qc.invalidateQueries({ queryKey: qk.tags(workspaceId) });
            qc.invalidateQueries({ queryKey: qk.layout(workspaceId) });
            onClose();
        },
        onError: (e) => toast.fromError(e),
    });
    return (
        <Sheet
            open
            onClose={onClose}
            title={tag ? "Edit tag" : "New tag"}
            footer={
                <>
                    <Button title="Cancel" variant="outline" style={{ flex: 1 }} onPress={onClose} />
                    <Button title="Save" style={{ flex: 1 }} loading={save.isPending} onPress={() => save.mutate()} />
                </>
            }
        >
            <Input label="Tag name" required value={name} onChangeText={setName} maxLength={50} />
            <SwitchRow label="Requires purchase" description="Subtasks with this tag can raise an indent and appear in project Materials." value={requirePurchase} onChange={setRequirePurchase} />
        </Sheet>
    );
}

/** settings/departments — departments-manager.tsx. */
export function DepartmentsTab() {
    const { colors } = useTheme();
    const qc = useQueryClient();
    const { workspaceId, isAdmin } = useWorkspace();
    const [open, setOpen] = useState<string | null>(null);
    const [editor, setEditor] = useState<any | null | undefined>(undefined);
    const q = useQuery({ queryKey: ["departments-full", workspaceId], queryFn: () => adminApi.departments(workspaceId), enabled: !!workspaceId });
    const schedules = useQuery({ queryKey: qk.shiftSchedules(workspaceId), queryFn: () => adminApi.shiftSchedules(workspaceId), enabled: !!workspaceId });
    const refresh = () => {
        qc.invalidateQueries({ queryKey: ["departments-full", workspaceId] });
        qc.invalidateQueries({ queryKey: qk.departments(workspaceId) });
    };
    const remove = useMutation({
        mutationFn: (id: string) => adminApi.deleteDepartment(workspaceId, id),
        onSuccess: () => {
            toast.success("Department deleted");
            refresh();
        },
        onError: (e) => toast.fromError(e, "Failed to delete department"),
    });

    return (
        <ScreenBody refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
            {isAdmin ? <Button icon={Plus} title="New department" variant="outline" onPress={() => setEditor(null)} /> : null}
            {q.isLoading ? <ListSkeleton rows={4} avatar={false} /> : null}
            {q.isError ? <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} /> : null}
            {!q.isLoading && !q.isError && !(q.data ?? []).length ? <EmptyState icon={Users} title="No departments yet" description="Group members and give each group its own shift timings." /> : null}
            {(q.data ?? []).map((d: any) => {
                const expanded = open === d.id;
                return (
                    <Card key={d.id} padded={false}>
                        <Pressable onPress={() => setOpen(expanded ? null : d.id)} style={styles.deptHead}>
                            {expanded ? <ChevronDown size={17} color={colors.mutedForeground} /> : <ChevronRight size={17} color={colors.mutedForeground} />}
                            <View style={{ flex: 1 }}>
                                <Text variant="title">{d.name}</Text>
                                <Text variant="caption" tone="muted">
                                    {d._count?.members ?? 0} members · {d.shiftSchedule?.name ?? "Workspace timings"}
                                </Text>
                            </View>
                            {isAdmin ? (
                                <>
                                    <Pressable hitSlop={8} onPress={() => setEditor(d)} style={{ padding: 6 }}>
                                        <Pencil size={16} color={colors.mutedForeground} />
                                    </Pressable>
                                    <Pressable
                                        hitSlop={8}
                                        style={{ padding: 6 }}
                                        onPress={async () => {
                                            if (await confirm({ title: `Delete ${d.name}?`, message: "Members are kept and fall back to the workspace timings until reassigned.", confirmLabel: "Delete", destructive: true })) remove.mutate(d.id);
                                        }}
                                    >
                                        <Trash2 size={16} color={colors.destructive} />
                                    </Pressable>
                                </>
                            ) : null}
                        </Pressable>
                        {expanded
                            ? (d.members ?? []).map((m: any) => (
                                  <View key={m.id} style={[styles.memberRow, { borderTopColor: colors.border }]}>
                                      <Avatar name={displayName(m.user)} image={m.user?.image} size={28} />
                                      <View style={{ flex: 1 }}>
                                          <Text variant="bodyMedium">{displayName(m.user)}</Text>
                                          <Text variant="caption" tone="muted">
                                              {m.designation ?? roleLabel(m.workspaceRole)}
                                          </Text>
                                      </View>
                                  </View>
                              ))
                            : null}
                    </Card>
                );
            })}
            {editor !== undefined ? (
                <Sheet
                    open
                    onClose={() => setEditor(undefined)}
                    title={editor ? "Edit department" : "New department"}
                    footer={null}
                >
                    <DepartmentForm department={editor} schedules={schedules.data ?? []} onDone={() => { setEditor(undefined); refresh(); }} />
                </Sheet>
            ) : null}
        </ScreenBody>
    );
}

function DepartmentForm({ department, schedules, onDone }: { department: any | null; schedules: any[]; onDone: () => void }) {
    const { workspaceId } = useWorkspace();
    const [name, setName] = useState(department?.name ?? "");
    const [scheduleId, setScheduleId] = useState<string | null>(department?.shiftScheduleId ?? null);
    const save = useMutation({
        mutationFn: () => {
            if (!name.trim()) throw new Error("Department name is required");
            const body = { name: name.trim(), shiftScheduleId: scheduleId };
            return department ? adminApi.updateDepartment(workspaceId, department.id, body) : adminApi.createDepartment(workspaceId, body);
        },
        onSuccess: () => {
            toast.success(department ? "Department updated" : "Department created");
            onDone();
        },
        onError: (e) => toast.fromError(e),
    });
    return (
        <>
            <Input label="Department name" required value={name} onChangeText={setName} maxLength={60} />
            <Select label="Shift schedule" value={scheduleId} onChange={setScheduleId} allowClear options={schedules.map((s) => ({ value: s.id, label: s.name, description: `${s.shiftStartTime} – ${s.shiftEndTime}` }))} placeholder="Workspace timings" />
            <Button title="Save" loading={save.isPending} onPress={() => save.mutate()} />
        </>
    );
}

/** settings/permissions — permissions-manager.tsx: the role grid and per-member exceptions. */
export function PermissionsTab() {
    const { colors } = useTheme();
    const qc = useQueryClient();
    const { workspaceId, role: viewerRole } = useWorkspace();
    const [mode, setMode] = useState<"roles" | "members">("roles");
    const [query, setQuery] = useState("");
    const [openMember, setOpenMember] = useState<string | null>(null);
    const key = qk.permissionsGrid(workspaceId);
    const q = useQuery({ queryKey: key, queryFn: () => adminApi.permissions(workspaceId), enabled: !!workspaceId && (viewerRole === "OWNER" || viewerRole === "ADMIN") });

    const roleOverrides: Record<string, Record<string, boolean>> = q.data?.roleOverrides ?? {};
    const effectiveRole = (role: WorkspaceRole, cap: Capability) => (role === "OWNER" ? true : roleOverrides[role]?.[cap] ?? DEFAULT_CAPABILITIES[role][cap]);
    const roleLocked = (role: WorkspaceRole) => role === "OWNER" || (role === "ADMIN" && viewerRole === "ADMIN");

    const setRole = useMutation({
        mutationFn: ({ role, cap, next }: { role: WorkspaceRole; cap: Capability; next: boolean }) =>
            adminApi.setRolePermission(workspaceId, { role, capability: cap, value: next === DEFAULT_CAPABILITIES[role][cap] ? null : next }),
        onMutate: ({ role, cap, next }) =>
            qc.setQueryData(key, (old: any) => {
                if (!old) return old;
                const forRole = { ...(old.roleOverrides[role] ?? {}) };
                if (next === DEFAULT_CAPABILITIES[role][cap]) delete forRole[cap];
                else forRole[cap] = next;
                return { ...old, roleOverrides: { ...old.roleOverrides, [role]: forRole } };
            }),
        onError: (e) => {
            toast.fromError(e, "Failed to update permission");
            qc.invalidateQueries({ queryKey: key });
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: qk.layout(workspaceId) }),
    });
    const setMember = useMutation({
        mutationFn: ({ memberId, cap, value }: { memberId: string; cap: Capability; value: boolean | null }) => adminApi.setMemberPermission(workspaceId, { workspaceMemberId: memberId, capability: cap, value }),
        onMutate: ({ memberId, cap, value }) =>
            qc.setQueryData(key, (old: any) =>
                old
                    ? {
                          ...old,
                          members: old.members.map((m: any) => {
                              if (m.id !== memberId) return m;
                              const overrides = { ...m.overrides };
                              if (value === null) delete overrides[cap];
                              else overrides[cap] = value;
                              return { ...m, overrides };
                          }),
                      }
                    : old,
            ),
        onError: (e) => {
            toast.fromError(e, "Failed to update permission");
            qc.invalidateQueries({ queryKey: key });
        },
    });

    if (viewerRole !== "OWNER" && viewerRole !== "ADMIN") {
        return <EmptyState icon={Lock} title="Owners and admins only" description="Only workspace owners and admins can change permissions." />;
    }

    const members = (q.data?.members ?? []).filter((m: any) => !query || m.name.toLowerCase().includes(query.toLowerCase()));

    return (
        <ScreenBody refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
            <Banner tone="info">Capabilities are a ceiling: unchecking one removes it everywhere for that role. Project roles still have to allow an action.</Banner>
            {q.isError ? <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} /> : null}
            <Tabs scrollable={false} value={mode} onChange={setMode} items={[{ key: "roles", label: "By role" }, { key: "members", label: "Exceptions" }]} />
            {q.isLoading ? <ListSkeleton rows={4} avatar={false} /> : null}
            {mode === "roles"
                ? WORKSPACE_ROLES.map((role) => (
                      <Card key={role} padded={false}>
                          <CardHeader title={roleLabel(role)} right={roleLocked(role) ? <Lock size={14} color={colors.mutedForeground} /> : null} />
                          {CAPABILITIES.map((c) => (
                              <View key={c.id} style={[styles.capRow, { borderTopColor: colors.border }]}>
                                  <View style={{ flex: 1 }}>
                                      <Text variant="bodyMedium">{c.label}</Text>
                                      <Text variant="caption" tone="muted">
                                          {c.group}
                                          {roleOverrides[role]?.[c.id] !== undefined ? " · changed" : ""}
                                      </Text>
                                  </View>
                                  <Switch value={effectiveRole(role, c.id)} disabled={roleLocked(role)} onChange={(next) => setRole.mutate({ role, cap: c.id, next })} />
                              </View>
                          ))}
                      </Card>
                  ))
                : null}
            {mode === "members" ? (
                <>
                    <SearchBar value={query} onChangeText={setQuery} placeholder="Search members…" />
                    {members.map((m: any) => {
                        const expanded = openMember === m.id;
                        const locked = m.role === "OWNER" || (m.role === "ADMIN" && viewerRole === "ADMIN");
                        const count = Object.keys(m.overrides ?? {}).length;
                        return (
                            <Card key={m.id} padded={false}>
                                <Pressable onPress={() => setOpenMember(expanded ? null : m.id)} style={styles.deptHead}>
                                    {expanded ? <ChevronDown size={17} color={colors.mutedForeground} /> : <ChevronRight size={17} color={colors.mutedForeground} />}
                                    <View style={{ flex: 1 }}>
                                        <Text variant="bodyMedium">{m.name}</Text>
                                        <Text variant="caption" tone="muted">
                                            {roleLabel(m.role)}
                                            {count ? ` · ${count} exception${count > 1 ? "s" : ""}` : ""}
                                        </Text>
                                    </View>
                                    {locked ? <Lock size={14} color={colors.mutedForeground} /> : null}
                                </Pressable>
                                {expanded
                                    ? CAPABILITIES.map((c) => {
                                          const override = m.overrides?.[c.id];
                                          const roleValue = effectiveRole(m.role, c.id);
                                          const value = override ?? roleValue;
                                          return (
                                              <View key={c.id} style={[styles.capRow, { borderTopColor: colors.border }]}>
                                                  <View style={{ flex: 1 }}>
                                                      <Text variant="bodyMedium">{c.label}</Text>
                                                      <Text variant="caption" tone="muted">
                                                          {override === undefined ? "From role" : "Exception"}
                                                      </Text>
                                                  </View>
                                                  {override !== undefined && !locked ? (
                                                      <Button size="sm" variant="ghost" title="Reset" onPress={() => setMember.mutate({ memberId: m.id, cap: c.id, value: null })} />
                                                  ) : null}
                                                  <Switch value={value} disabled={locked} onChange={(next) => setMember.mutate({ memberId: m.id, cap: c.id, value: next === roleValue ? null : next })} />
                                              </View>
                                          );
                                      })
                                    : null}
                            </Card>
                        );
                    })}
                </>
            ) : null}
        </ScreenBody>
    );
}

/** settings/activity — the last 100 audit log entries (admins only). */
export function ActivityTab() {
    const { colors } = useTheme();
    const { workspaceId, isAdmin } = useWorkspace();
    const [filter, setFilter] = useState("");
    const q = useQuery({ queryKey: qk.audit(workspaceId), queryFn: () => adminApi.activity(workspaceId), enabled: !!workspaceId && isAdmin });
    const logs = useMemo(() => (q.data ?? []).filter((l: any) => !filter || l.action.toLowerCase().includes(filter.toLowerCase().replace(/ /g, "_"))), [q.data, filter]);

    if (!isAdmin) return <EmptyState icon={Lock} title="You do not have permission to view this page." />;

    return (
        <FlatList
            data={logs}
            keyExtractor={(l) => l.id}
            contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 60 }}
            refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={colors.primaryInk} />}
            ListHeaderComponent={<SearchBar value={filter} onChangeText={setFilter} placeholder="Filter by action…" />}
            ListHeaderComponentStyle={{ marginBottom: 6 }}
            ListEmptyComponent={
                q.isLoading ? <ListSkeleton rows={6} /> : q.isError ? <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} /> : <EmptyState title="No activity yet" compact />
            }
            renderItem={({ item: l }) => (
                <Card style={{ flexDirection: "row", gap: 12, alignItems: "center", padding: 12 }}>
                    <Avatar name={displayName(l.user)} image={l.user?.image} size={32} />
                    <View style={{ flex: 1, gap: 4 }}>
                        <Text variant="bodyMedium">{displayName(l.user, "System")}</Text>
                        <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                            <Badge label={l.action.replace(/_/g, " ")} size="xs" variant="outline" color={colors.mutedForeground} />
                            {l.entityType ? <Badge label={l.entityType} size="xs" variant="muted" /> : null}
                        </View>
                        <Text variant="caption" tone="muted">
                            {fmtDateTime(l.createdAt)}
                        </Text>
                    </View>
                </Card>
            )}
        />
    );
}

const styles = StyleSheet.create({
    tagRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 11 },
    deptHead: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14 },
    memberRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 9, borderTopWidth: 1 },
    capRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderRadius: radius.xs },
});
