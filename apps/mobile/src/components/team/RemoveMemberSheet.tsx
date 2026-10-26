import { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckSquare, Square } from "lucide-react-native";
import { workspacesApi, type WorkspaceMember } from "../../api/workspaces";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { qk } from "../../lib/query";
import { displayName } from "../../lib/format";
import { toast } from "../../lib/toast";
import { useTheme } from "../../theme/ThemeProvider";
import { radius } from "../../theme/tokens";
import { Badge, Banner, Button, ListSkeleton, Select, Sheet, StatusBadge, Text, confirm } from "../ui";

type JoinRole = "MEMBER" | "LEAD" | "PROJECT_COORDINATOR";

/**
 * remove-member-dialog.tsx: every pending task the leaver holds must go to
 * someone before they're deactivated. Handing a task into a project the
 * receiver isn't in asks for their role there; a task the leaver both does
 * and reviews can leave its assignee empty instead.
 */
export function RemoveMemberSheet({ member, onClose, onDone }: { member: WorkspaceMember; onClose: () => void; onDone: () => void }) {
    const { colors } = useTheme();
    const { workspaceId } = useWorkspace();
    const work = useQuery({ queryKey: ["pending-work", member.id], queryFn: () => workspacesApi.pendingWork(workspaceId, member.id) });
    const slim = useQuery({ queryKey: qk.membersSlim(workspaceId), queryFn: () => workspacesApi.membersSlim(workspaceId) });
    const [ticked, setTicked] = useState<Set<string>>(new Set());
    const [dest, setDest] = useState<Map<string, string>>(new Map());
    const [vacated, setVacated] = useState<Set<string>>(new Set());
    const [roles, setRoles] = useState<Map<string, JoinRole>>(new Map());
    const [picked, setPicked] = useState<string | null>(null);
    const [memberIdsByProject, setMemberIdsByProject] = useState<Record<string, string[]> | null>(null);

    const tasks: any[] = work.data?.tasks ?? [];
    const projectMembers = memberIdsByProject ?? work.data?.projectMemberUserIds ?? {};
    const candidates = useMemo(
        () => (slim.data ?? []).filter((m: any) => m.userId && m.userId !== member.userId).map((m: any) => ({ value: m.userId as string, label: displayName(m.user ?? m) })),
        [slim.data, member.userId],
    );
    const nameOf = (id: string) => candidates.find((c) => c.value === id)?.label ?? "Unknown";
    const allResolved = dest.size === tasks.length;

    const assign = async () => {
        if (!picked || ticked.size === 0) return;
        const chosen = tasks.filter((t) => ticked.has(t.id));
        const missing = [...new Map(chosen.filter((t) => !(projectMembers[t.projectId] ?? []).includes(picked)).map((t) => [t.projectId, { id: t.projectId, name: t.projectName }])).values()];
        if (missing.length) {
            const ok = await confirm({
                title: `Add ${nameOf(picked)} to ${missing.length} project${missing.length > 1 ? "s" : ""}?`,
                message: `${missing.map((p) => p.name).join(", ")} — they'll join as Member. You can change their role below before removing.`,
                confirmLabel: "Add & assign",
            });
            if (!ok) return;
            setRoles((prev) => {
                const next = new Map(prev);
                missing.forEach((p) => !next.has(p.id) && next.set(p.id, "MEMBER"));
                return next;
            });
            setMemberIdsByProject({ ...projectMembers, ...Object.fromEntries(missing.map((p) => [p.id, [...(projectMembers[p.id] ?? []), picked]])) });
        }
        const collisions = chosen.filter((t) => t.roles.length === 2).map((t) => t.id);
        let vacate = false;
        if (collisions.length) {
            vacate = await confirm({
                title: "Same person doing and reviewing",
                message: `${member.surname || member.name} both does and reviews ${collisions.length} of these. ${nameOf(picked)} would become both too. Leave the assignee empty on those instead?`,
                confirmLabel: "Leave assignee empty",
                cancelLabel: "Give both roles",
            });
        }
        setDest((prev) => {
            const next = new Map(prev);
            chosen.forEach((t) => next.set(t.id, picked));
            return next;
        });
        if (vacate) setVacated((prev) => new Set([...prev, ...collisions]));
        setTicked(new Set());
        setPicked(null);
    };

    const remove = useMutation({
        mutationFn: () => {
            const grouped = new Map<string, string[]>();
            for (const [taskId, userId] of dest) grouped.set(userId, [...(grouped.get(userId) ?? []), taskId]);
            return workspacesApi.deactivate(workspaceId, member.id, {
                assignments: [...grouped].map(([toUserId, taskIds]) => ({ toUserId, taskIds })),
                projectRoles: Object.fromEntries(roles),
                vacatedAssigneeTaskIds: [...vacated],
            });
        },
        onSuccess: (res: any) => {
            toast.success(res?.message ?? "Member removed");
            onDone();
            onClose();
        },
        onError: (e) => toast.fromError(e, "Could not remove this member"),
    });

    return (
        <Sheet
            open
            onClose={onClose}
            title={`Remove ${work.data?.memberName || displayName(member)}`}
            description={tasks.length ? `Hand over ${tasks.length} pending task${tasks.length > 1 ? "s" : ""} first.` : "They have no pending work."}
            footer={
                <>
                    <Button title="Cancel" variant="outline" style={{ flex: 1 }} onPress={onClose} />
                    <Button title="Remove member" variant="destructive" style={{ flex: 1.3 }} disabled={!allResolved || work.isLoading} loading={remove.isPending} onPress={() => remove.mutate()} />
                </>
            }
        >
            {work.isLoading ? <ListSkeleton rows={3} avatar={false} /> : null}
            {work.isError ? <Banner tone="destructive">{(work.error as Error).message || "Could not load their tasks"}</Banner> : null}
            {tasks.length ? (
                <>
                    <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-end" }}>
                        <View style={{ flex: 1 }}>
                            <Select label={`Assign ${ticked.size || ""} selected to`} value={picked} onChange={setPicked} options={candidates} searchable placeholder="Choose a person" />
                        </View>
                        <Button title="Assign" disabled={!picked || ticked.size === 0} onPress={assign} />
                    </View>
                    <Pressable onPress={() => setTicked(ticked.size === tasks.length ? new Set() : new Set(tasks.map((t) => t.id)))}>
                        <Text variant="label" tone="primary">
                            {ticked.size === tasks.length ? "Clear selection" : "Select all"}
                        </Text>
                    </Pressable>
                    {tasks.map((t) => {
                        const on = ticked.has(t.id);
                        const to = dest.get(t.id);
                        return (
                            <Pressable
                                key={t.id}
                                onPress={() =>
                                    setTicked((prev) => {
                                        const next = new Set(prev);
                                        next.has(t.id) ? next.delete(t.id) : next.add(t.id);
                                        return next;
                                    })
                                }
                                style={[styles.task, { borderColor: to ? colors.success : colors.border, backgroundColor: on ? colors.accent : colors.card }]}
                            >
                                {on ? <CheckSquare size={18} color={colors.primaryInk} /> : <Square size={18} color={colors.mutedForeground} />}
                                <View style={{ flex: 1, gap: 4 }}>
                                    <Text variant="bodyMedium" numberOfLines={2}>
                                        {t.name}
                                    </Text>
                                    <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                                        <Text variant="caption" tone="muted">
                                            {t.projectName}
                                        </Text>
                                        <StatusBadge status={t.status} size="xs" />
                                        {t.roles.map((r: string) => (
                                            <Badge key={r} label={r} size="xs" variant="muted" />
                                        ))}
                                    </View>
                                    {to ? (
                                        <Text variant="caption" tone="success">
                                            → {nameOf(to)}
                                            {vacated.has(t.id) ? " (reviewer only)" : ""}
                                        </Text>
                                    ) : null}
                                </View>
                            </Pressable>
                        );
                    })}
                    {roles.size ? (
                        <View style={{ gap: 8 }}>
                            <Text variant="overline" tone="muted">
                                Role in newly joined projects
                            </Text>
                            {[...roles].map(([projectId, role]) => (
                                <Select
                                    key={projectId}
                                    label={tasks.find((t) => t.projectId === projectId)?.projectName}
                                    value={role}
                                    onChange={(v) => v && setRoles((prev) => new Map(prev).set(projectId, v as JoinRole))}
                                    options={[
                                        { value: "MEMBER", label: "Member" },
                                        { value: "LEAD", label: "Lead" },
                                        { value: "PROJECT_COORDINATOR", label: "Project coordinator" },
                                    ]}
                                />
                            ))}
                        </View>
                    ) : null}
                    <Text variant="caption" tone="muted">
                        {dest.size} of {tasks.length} tasks handed over
                    </Text>
                </>
            ) : null}
        </Sheet>
    );
}

const styles = StyleSheet.create({
    task: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 12, borderRadius: radius.md, borderWidth: 1 },
});
