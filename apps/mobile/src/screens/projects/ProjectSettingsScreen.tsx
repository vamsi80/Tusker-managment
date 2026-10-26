import { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Lock, Trash2, UserPlus } from "lucide-react-native";
import { projectsApi } from "../../api/projects";
import { workspacesApi } from "../../api/workspaces";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { qk } from "../../lib/query";
import { PROJECT_PERMISSIONS, roleLabel, type ProjectPermissionId } from "../../lib/constants";
import { displayName } from "../../lib/format";
import { toast } from "../../lib/toast";
import { useTheme } from "../../theme/ThemeProvider";
import { radius } from "../../theme/tokens";
import { Avatar, Badge, Banner, Button, Card, CardHeader, EmptyState, ErrorState, ListSkeleton, MultiSelect, SearchBar, Select, Sheet, SwitchRow, Tabs, Text, confirm } from "../../components/ui";
import { Screen, ScreenBody, ScreenHeader } from "../../components/layout/Screen";
import type { RootStackParamList } from "../../navigation/types";
import { tone } from "../../theme/tone";

/** DEFAULT_PROJECT_PERMISSIONS from project-permissions.ts. */
const ROLE_DEFAULTS: Record<string, Partial<Record<ProjectPermissionId, boolean>>> = (() => {
    const all = (v: boolean) => Object.fromEntries(PROJECT_PERMISSIONS.map((p) => [p.id, v])) as Record<ProjectPermissionId, boolean>;
    return { PROJECT_MANAGER: all(true), PROJECT_COORDINATOR: all(true), LEAD: all(true), MEMBER: { ...all(false), "task:status": true }, VIEWER: all(false) };
})();

const ROLE_OPTIONS = [
    { value: "PROJECT_MANAGER", label: "Project Manager" },
    { value: "PROJECT_COORDINATOR", label: "Coordinator" },
    { value: "LEAD", label: "Lead" },
    { value: "MEMBER", label: "Member" },
    { value: "VIEWER", label: "Viewer" },
];

/** projectSettings/[projectId] + the sidebar's Manage Members dialog. */
export function ProjectSettingsScreen({ route }: NativeStackScreenProps<RootStackParamList, "ProjectSettings">) {
    const { projectId } = route.params;
    const { workspaceId } = useWorkspace();
    const [tab, setTab] = useState<"members" | "permissions" | "rules">("members");
    const settings = useQuery({ queryKey: qk.projectSettings(workspaceId, projectId), queryFn: () => projectsApi.settings(workspaceId, projectId), enabled: !!workspaceId });

    return (
        <Screen>
            <ScreenHeader title="Project settings" subtitle={settings.data?.projectName} back showActions={false} />
            <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
                <Tabs
                    scrollable={false}
                    value={tab}
                    onChange={setTab}
                    items={[
                        { key: "members", label: "Members" },
                        { key: "permissions", label: "Permissions" },
                        { key: "rules", label: "Rules" },
                    ]}
                />
            </View>
            {settings.isError ? (
                <ErrorState message={(settings.error as Error).message} onRetry={() => settings.refetch()} />
            ) : tab === "members" ? (
                <MembersTab projectId={projectId} />
            ) : tab === "permissions" ? (
                <PermissionsTab projectId={projectId} data={settings.data} loading={settings.isLoading} />
            ) : (
                <RulesTab projectId={projectId} data={settings.data} />
            )}
        </Screen>
    );
}

function MembersTab({ projectId }: { projectId: string }) {
    const qc = useQueryClient();
    const { workspaceId } = useWorkspace();
    const [adding, setAdding] = useState(false);
    const [toAdd, setToAdd] = useState<string[]>([]);
    const members = useQuery({ queryKey: qk.projectMembers(projectId), queryFn: () => projectsApi.members(projectId) });
    const workspace = useQuery({ queryKey: qk.membersSlim(workspaceId), queryFn: () => workspacesApi.membersSlim(workspaceId), enabled: adding });

    const refresh = () => {
        qc.invalidateQueries({ queryKey: qk.projectMembers(projectId) });
        qc.invalidateQueries({ queryKey: qk.projectSettings(workspaceId, projectId) });
        qc.invalidateQueries({ queryKey: qk.layout(workspaceId) });
    };

    const add = useMutation({
        mutationFn: () => projectsApi.addMembers(projectId, toAdd),
        onSuccess: () => {
            toast.success("Members added successfully");
            setToAdd([]);
            setAdding(false);
            refresh();
        },
        onError: (e) => toast.fromError(e, "Failed to add members"),
    });
    const role = useMutation({
        mutationFn: ({ userId, role }: { userId: string; role: string }) => projectsApi.setMemberRole(projectId, userId, role),
        onSuccess: () => {
            toast.success("Member role updated");
            refresh();
        },
        onError: (e) => toast.fromError(e, "Failed to update role"),
    });
    const remove = useMutation({
        mutationFn: (userId: string) => projectsApi.removeMembers(projectId, [userId]),
        onSuccess: () => {
            toast.success("Member removed");
            refresh();
        },
        onError: (e) => toast.fromError(e, "Failed to remove member"),
    });

    const existing = new Set((members.data ?? []).map((m: any) => m.userId ?? m.id));
    const candidates = (workspace.data ?? []).filter((m: any) => !existing.has(m.userId)).map((m: any) => ({ value: m.userId, label: displayName(m.user ?? m), description: roleLabel(m.workspaceRole) }));

    return (
        <ScreenBody refreshing={members.isRefetching} onRefresh={() => members.refetch()}>
            <Button icon={UserPlus} title="Add members" variant="outline" onPress={() => setAdding(true)} />
            {members.isLoading ? (
                <ListSkeleton rows={5} />
            ) : (members.data ?? []).length === 0 ? (
                <EmptyState title="No members yet" compact />
            ) : (
                (members.data ?? []).map((m: any) => {
                    const userId = m.userId ?? m.id;
                    const isAdmin = m.workspaceRole === "OWNER" || m.workspaceRole === "ADMIN";
                    return (
                        <Card key={m.projectMemberId ?? userId} style={{ gap: 10 }}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                                <Avatar name={displayName(m.user)} image={m.user?.image} size={36} />
                                <View style={{ flex: 1 }}>
                                    <Text variant="bodyMedium">{displayName(m.user)}</Text>
                                    <Text variant="caption" tone="muted">
                                        {roleLabel(m.workspaceRole)} in workspace
                                    </Text>
                                </View>
                                {!isAdmin ? (
                                    <Pressable
                                        hitSlop={8}
                                        onPress={async () => {
                                            if (await confirm({ title: `Remove ${displayName(m.user)} from this project?`, confirmLabel: "Remove", destructive: true })) remove.mutate(userId);
                                        }}
                                    >
                                        <Trash2 size={17} color={tone("danger")} />
                                    </Pressable>
                                ) : null}
                            </View>
                            <Select title="Project role" value={m.projectRole} onChange={(v) => v && v !== m.projectRole && role.mutate({ userId, role: v })} options={ROLE_OPTIONS} disabled={isAdmin} />
                        </Card>
                    );
                })
            )}
            <Sheet
                open={adding}
                onClose={() => setAdding(false)}
                title="Add members"
                footer={
                    <>
                        <Button title="Cancel" variant="outline" style={{ flex: 1 }} onPress={() => setAdding(false)} />
                        <Button title={`Add${toAdd.length ? ` (${toAdd.length})` : ""}`} style={{ flex: 1 }} disabled={!toAdd.length} loading={add.isPending} onPress={() => add.mutate()} />
                    </>
                }
            >
                <MultiSelect label="Workspace members" values={toAdd} onChange={setToAdd} options={candidates} searchable placeholder={workspace.isLoading ? "Loading…" : "Select members"} />
            </Sheet>
        </ScreenBody>
    );
}

function PermissionsTab({ projectId, data, loading }: { projectId: string; data: any; loading: boolean }) {
    const { colors } = useTheme();
    const qc = useQueryClient();
    const { workspaceId } = useWorkspace();
    const [search, setSearch] = useState("");
    const [open, setOpen] = useState<string | null>(null);

    const cell = useMutation({
        mutationFn: (member: { projectMemberId: string; permission: string; value: boolean | null }) => projectsApi.updateSettings(workspaceId, projectId, { member }),
        onMutate: async (member) => {
            qc.setQueryData(qk.projectSettings(workspaceId, projectId), (old: any) =>
                old
                    ? {
                          ...old,
                          members: old.members.map((m: any) => {
                              if (m.projectMemberId !== member.projectMemberId) return m;
                              const overrides = { ...m.overrides };
                              if (member.value === null) delete overrides[member.permission];
                              else overrides[member.permission] = member.value;
                              return { ...m, overrides };
                          }),
                      }
                    : old,
            );
        },
        onError: (e) => {
            toast.fromError(e, "Failed to update permission");
            qc.invalidateQueries({ queryKey: qk.projectSettings(workspaceId, projectId) });
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: ["project-permissions", workspaceId, projectId] }),
    });

    const members = useMemo(() => (data?.members ?? []).filter((m: any) => !search || m.name.toLowerCase().includes(search.toLowerCase())), [data, search]);

    return (
        <ScreenBody>
            <Banner tone="info">Each member starts from their role's defaults. Tap a permission to override it; tap again to go back to the role default.</Banner>
            <SearchBar value={search} onChangeText={setSearch} placeholder="Search members…" />
            {loading ? <ListSkeleton rows={5} /> : null}
            {members.map((m: any) => {
                const expanded = open === m.projectMemberId;
                const defaults = ROLE_DEFAULTS[m.projectRole] ?? {};
                const overrideCount = Object.keys(m.overrides ?? {}).length;
                return (
                    <Card key={m.projectMemberId} padded={false}>
                        <Pressable onPress={() => setOpen(expanded ? null : m.projectMemberId)} style={styles.memberHead}>
                            {expanded ? <ChevronDown size={17} color={colors.mutedForeground} /> : <ChevronRight size={17} color={colors.mutedForeground} />}
                            <View style={{ flex: 1 }}>
                                <Text variant="bodyMedium">{m.name}</Text>
                                <Text variant="caption" tone="muted">
                                    {roleLabel(m.projectRole)}
                                    {overrideCount ? ` · ${overrideCount} custom` : ""}
                                </Text>
                            </View>
                            {m.locked ? <Lock size={15} color={colors.mutedForeground} /> : null}
                        </Pressable>
                        {expanded
                            ? PROJECT_PERMISSIONS.map((p) => {
                                  const override = m.overrides?.[p.id];
                                  const effective = m.locked ? true : override ?? defaults[p.id] ?? false;
                                  return (
                                      <Pressable
                                          key={p.id}
                                          disabled={m.locked}
                                          // Role default → the opposite (an override) → back to the role default.
                                          onPress={() => cell.mutate({ projectMemberId: m.projectMemberId, permission: p.id, value: override === undefined ? !defaults[p.id] : null })}
                                          style={[styles.permRow, { borderTopColor: colors.border }]}
                                      >
                                          <View style={{ flex: 1, gap: 2 }}>
                                              <Text variant="bodyMedium">{p.label}</Text>
                                              <Text variant="caption" tone="muted">
                                                  {p.group}
                                              </Text>
                                          </View>
                                          {override !== undefined ? <Badge label="Custom" size="xs" color={colors.info} /> : null}
                                          <Badge label={effective ? "Allowed" : "Denied"} color={effective ? colors.success : colors.destructive} variant="soft" size="xs" />
                                      </Pressable>
                                  );
                              })
                            : null}
                    </Card>
                );
            })}
        </ScreenBody>
    );
}

function RulesTab({ projectId, data }: { projectId: string; data: any }) {
    const qc = useQueryClient();
    const { workspaceId } = useWorkspace();
    const settings = data?.settings ?? { mandatoryComment: false, mandatoryAttachment: false };
    const save = useMutation({
        mutationFn: (patch: Record<string, boolean>) => projectsApi.updateSettings(workspaceId, projectId, { settings: patch }),
        onSuccess: () => {
            toast.success("Project settings saved");
            qc.invalidateQueries({ queryKey: qk.projectSettings(workspaceId, projectId) });
            qc.invalidateQueries({ queryKey: ["project-permissions", workspaceId, projectId] });
        },
        onError: (e) => toast.fromError(e, "Failed to save settings"),
    });
    return (
        <ScreenBody>
            <Card padded={false}>
                <CardHeader title="Status changes" description="What a status change that needs explaining must include." />
                <View style={{ padding: 16, gap: 8 }}>
                    <SwitchRow label="Mandatory comment" description="A comment is required for Review, Hold, Cancelled and moves back." value={!!settings.mandatoryComment} onChange={(v) => save.mutate({ mandatoryComment: v })} />
                    <SwitchRow label="Mandatory attachment" description="An attachment (link or file) is required as well." value={!!settings.mandatoryAttachment} onChange={(v) => save.mutate({ mandatoryAttachment: v })} />
                </View>
            </Card>
            <Text variant="small" tone="muted">
                With both off, a comment or an attachment link is enough.
            </Text>
        </ScreenBody>
    );
}

const styles = StyleSheet.create({
    memberHead: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14 },
    permRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 11, borderTopWidth: 1, borderRadius: radius.xs },
});
