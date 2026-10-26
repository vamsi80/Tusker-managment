import { useMemo, useState } from "react";
import { FlatList, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, KeyRound, Mail, MessageSquare, MoreHorizontal, Pencil, Phone, RotateCcw, UserMinus, UserPlus } from "lucide-react-native";
import { workspacesApi, type WorkspaceMember } from "../../api/workspaces";
import { conversationsApi } from "../../api/comms";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { qk } from "../../lib/query";
import { WORKSPACE_ROLES, roleLabel } from "../../lib/constants";
import { displayName, fmtDate, toDateOnlyString } from "../../lib/format";
import { toast } from "../../lib/toast";
import { useTheme } from "../../theme/ThemeProvider";
import { ActionMenu, Avatar, Badge, Button, Card, Chip, DateField, EmptyState, Input, KeyValue, ListSkeleton, MultiSelect, SearchBar, Select, Sheet, Text, confirm } from "../ui";
import { useDebounced } from "../task/TaskFilters";
import { RemoveMemberSheet } from "./RemoveMemberSheet";

/** team/page.tsx — the members table with admin actions. */
export function MembersTab() {
    const { colors } = useTheme();
    const navigation = useNavigation<any>();
    const qc = useQueryClient();
    const { workspaceId, isAdmin, role } = useWorkspace();
    const [search, setSearch] = useState("");
    const [roles, setRoles] = useState<string[]>([]);
    const [departmentId, setDepartmentId] = useState<string | null>(null);
    const [view, setView] = useState<WorkspaceMember | null>(null);
    const [edit, setEdit] = useState<WorkspaceMember | "new" | null>(null);
    const [menu, setMenu] = useState<WorkspaceMember | null>(null);
    const [removing, setRemoving] = useState<WorkspaceMember | null>(null);
    const debounced = useDebounced(search);
    const canSeeWorkload = isAdmin || role === "MANAGER";

    const params = { search: debounced || undefined, role: roles.length ? roles : undefined, departmentId: departmentId ?? undefined, limit: 500 };
    const q = useQuery({ queryKey: qk.members(workspaceId, params), queryFn: () => workspacesApi.members(workspaceId, params), enabled: !!workspaceId });
    const departments = useQuery({ queryKey: qk.departments(workspaceId), queryFn: () => workspacesApi.departments(workspaceId), enabled: !!workspaceId });
    const members = q.data?.workspaceMembers ?? [];
    const refresh = () => qc.invalidateQueries({ queryKey: ["members", workspaceId] });

    const adminAction = useMutation({
        mutationFn: ({ kind, m }: { kind: "resend" | "reset" | "reactivate"; m: WorkspaceMember }) =>
            kind === "resend" ? workspacesApi.resendInvite(workspaceId, m.id) : kind === "reset" ? workspacesApi.resetPassword(workspaceId, m.id) : workspacesApi.reactivate(workspaceId, m.id),
        onSuccess: (res: any, { kind }) => {
            toast.success(res?.message ?? (kind === "resend" ? "Invitation resent" : kind === "reset" ? "Password reset email sent" : "Member reactivated"));
            refresh();
        },
        onError: (e) => toast.fromError(e),
    });

    const openChat = async (m: WorkspaceMember) => {
        try {
            const conversation = await conversationsApi.open(workspaceId, m.userId);
            navigation.navigate("Chat", { conversationId: conversation.id, name: displayName(m), userId: m.userId });
        } catch (e) {
            toast.fromError(e, "Couldn't open the conversation");
        }
    };

    return (
        <>
            <FlatList
                data={members}
                keyExtractor={(m) => m.id}
                contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 60 }}
                refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={colors.primaryInk} />}
                ListHeaderComponent={
                    <View style={{ gap: 10, marginBottom: 4 }}>
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                            <Text variant="small" tone="muted" style={{ flex: 1 }}>
                                {q.data?.totalCount ?? members.length} members
                            </Text>
                            {isAdmin ? <Button size="sm" icon={UserPlus} title="Invite" onPress={() => setEdit("new")} /> : null}
                        </View>
                        <SearchBar value={search} onChangeText={setSearch} placeholder="Search members…" />
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                            <MultiSelect title="Role" values={roles} onChange={setRoles} options={WORKSPACE_ROLES.map((r) => ({ value: r, label: roleLabel(r) }))} trigger={(open) => <Chip label={roles.length ? `Role · ${roles.length}` : "Role"} active={!!roles.length} onPress={open} />} />
                            <Select
                                title="Department"
                                value={departmentId}
                                onChange={setDepartmentId}
                                allowClear
                                options={[{ value: "none", label: "No department" }, ...(departments.data ?? []).map((d) => ({ value: d.id, label: d.name }))]}
                                trigger={(open, label) => <Chip label={label ?? "Department"} active={!!departmentId} onPress={open} />}
                            />
                        </ScrollView>
                    </View>
                }
                ListEmptyComponent={q.isLoading ? <ListSkeleton rows={6} /> : <EmptyState title="No members found" compact />}
                renderItem={({ item: m }) => (
                    <Card onPress={() => setView(m)} style={{ gap: 10 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                            <Avatar name={displayName(m)} image={m.image} size={42} />
                            <View style={{ flex: 1, gap: 2 }}>
                                <Text variant="title" numberOfLines={1}>
                                    {displayName(m)}
                                </Text>
                                <Text variant="caption" tone="muted" numberOfLines={1}>
                                    {[m.designation, m.departmentName].filter(Boolean).join(" · ") || m.email}
                                </Text>
                            </View>
                            {isAdmin ? (
                                <Pressable hitSlop={8} onPress={() => setMenu(m)}>
                                    <MoreHorizontal size={19} color={colors.mutedForeground} />
                                </Pressable>
                            ) : null}
                        </View>
                        <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                            <Badge label={roleLabel(m.workspaceRole)} size="xs" variant="muted" />
                            <Badge label={m.status ?? "Pending"} size="xs" color={m.status === "Verified" ? colors.success : colors.warning} />
                            {canSeeWorkload ? <Badge label={`${m.openTaskCount ?? 0} tasks`} size="xs" color={(m.openTaskCount ?? 0) >= 10 ? colors.destructive : (m.openTaskCount ?? 0) >= 5 ? colors.warning : colors.info} /> : null}
                            {m.reportToName ? (
                                <Text variant="caption" tone="muted">
                                    Reports to {m.reportToName}
                                </Text>
                            ) : null}
                        </View>
                    </Card>
                )}
            />

            {view ? (
                <Sheet open onClose={() => setView(null)} title={displayName(view)} description={view.email ?? undefined}>
                    <View style={{ alignItems: "center", gap: 8 }}>
                        <Avatar name={displayName(view)} image={view.image} size={72} />
                        <Badge label={roleLabel(view.workspaceRole)} />
                    </View>
                    <View style={styles.grid}>
                        {(
                            [
                                ["Full name", view.name],
                                ["Nickname", view.surname],
                                ["Employee ID", view.employeeId],
                                ["Date of birth", view.dateOfBirth ? fmtDate(view.dateOfBirth) : null],
                                ["Designation", view.designation],
                                ["Department", view.departmentName],
                                ["Reports to", view.reportToName],
                                ["Phone", view.phoneNumber],
                            ] as const
                        ).map(([label, value]) => (
                            <View key={label} style={styles.cell}>
                                <KeyValue label={label} value={value} />
                            </View>
                        ))}
                    </View>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                        <Button style={{ flex: 1 }} variant="outline" icon={MessageSquare} title="Message" onPress={() => { const m = view; setView(null); openChat(m); }} />
                        {view.phoneNumber ? <Button style={{ flex: 1 }} variant="outline" icon={Phone} title="Call" onPress={() => Linking.openURL(`tel:${view.phoneNumber}`)} /> : null}
                        {view.email ? <Button style={{ flex: 1 }} variant="outline" icon={Mail} title="Email" onPress={() => Linking.openURL(`mailto:${view.email}`)} /> : null}
                    </View>
                </Sheet>
            ) : null}

            <ActionMenu
                open={!!menu}
                onClose={() => setMenu(null)}
                title={menu ? displayName(menu) : ""}
                actions={[
                    { label: "View", icon: Eye, onPress: () => setView(menu) },
                    { label: "Edit member", icon: Pencil, onPress: () => setEdit(menu) },
                    { label: "Message", icon: MessageSquare, onPress: () => menu && openChat(menu) },
                    { label: "Resend invitation", icon: Mail, hidden: menu?.status === "Verified", onPress: () => menu && adminAction.mutate({ kind: "resend", m: menu }) },
                    {
                        label: "Send password reset",
                        icon: KeyRound,
                        onPress: async () => {
                            if (menu && (await confirm({ title: "Send a password reset email?", message: `${displayName(menu)} will get a link to set a new password.` }))) adminAction.mutate({ kind: "reset", m: menu });
                        },
                    },
                    { label: "Reactivate", icon: RotateCcw, hidden: menu?.isActive !== false, onPress: () => menu && adminAction.mutate({ kind: "reactivate", m: menu }) },
                    { label: "Remove from workspace", icon: UserMinus, destructive: true, hidden: menu?.workspaceRole === "OWNER", onPress: () => setRemoving(menu) },
                ]}
            />
            {edit ? <MemberFormSheet member={edit === "new" ? null : edit} onClose={() => setEdit(null)} onSaved={refresh} /> : null}
            {removing ? <RemoveMemberSheet member={removing} onClose={() => setRemoving(null)} onDone={refresh} /> : null}
        </>
    );
}

/** create-user.tsx (inviteUserSchema) and edit-member-dialog.tsx (updateMemberSchema). */
function MemberFormSheet({ member, onClose, onSaved }: { member: WorkspaceMember | null; onClose: () => void; onSaved: () => void }) {
    const { workspaceId } = useWorkspace();
    const [name, setName] = useState(member?.name ?? "");
    const [nickname, setNickname] = useState(member?.surname ?? "");
    const [email, setEmail] = useState(member?.email ?? "");
    const [phone, setPhone] = useState(member?.phoneNumber ?? "");
    const [employeeId, setEmployeeId] = useState(member?.employeeId ?? "");
    const [dob, setDob] = useState<Date | null>(member?.dateOfBirth ? new Date(member.dateOfBirth) : null);
    const [designation, setDesignation] = useState(member?.designation ?? "");
    const [reportToId, setReportToId] = useState<string | null>(member?.reportToId ?? null);
    const [departmentId, setDepartmentId] = useState<string | null>(member?.departmentId ?? null);
    const [role, setRole] = useState<string>(member?.workspaceRole ?? "MEMBER");
    const slim = useQuery({ queryKey: qk.membersSlim(workspaceId), queryFn: () => workspacesApi.membersSlim(workspaceId) });
    const departments = useQuery({ queryKey: qk.departments(workspaceId), queryFn: () => workspacesApi.departments(workspaceId) });

    const save = useMutation({
        mutationFn: () => {
            if (name.trim().length < 3) throw new Error("Name must be at least 3 characters long");
            if (!email.trim()) throw new Error("Email is required");
            if (!designation.trim()) throw new Error("Designation is required");
            if (!employeeId.trim()) throw new Error("Employee ID is required");
            if (!dob) throw new Error("Date of Birth is required");
            const common = {
                name: name.trim(),
                email: email.trim(),
                phoneNumber: phone.trim() || null,
                designation: designation.trim(),
                employeeId: employeeId.trim(),
                dateOfBirth: toDateOnlyString(dob),
                reportToId: reportToId || null,
                departmentId: departmentId || null,
                role,
                workspaceId,
            };
            return member
                ? workspacesApi.updateMember(workspaceId, member.id, { ...common, surname: nickname.trim() || null })
                : workspacesApi.invite(workspaceId, { ...common, niceName: nickname.trim() || name.trim().split(" ")[0] });
        },
        onSuccess: () => {
            toast.success(member ? "Member updated" : "Member invited successfully");
            onSaved();
            onClose();
        },
        onError: (e) => toast.fromError(e),
    });

    return (
        <Sheet
            open
            onClose={onClose}
            title={member ? "Edit member" : "Invite member"}
            description={member ? undefined : "They'll get an email to activate their account."}
            footer={
                <>
                    <Button title="Cancel" variant="outline" style={{ flex: 1 }} onPress={onClose} />
                    <Button title={member ? "Save" : "Send invite"} style={{ flex: 1 }} loading={save.isPending} onPress={() => save.mutate()} />
                </>
            }
        >
            <Input label="Full Name" required placeholder="John Doe" value={name} onChangeText={setName} />
            <Input label="Nickname" required={!member} placeholder="John" value={nickname} onChangeText={setNickname} />
            <Input label="Email Address" required placeholder="john@example.com" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />
            <Input label="Phone Number" placeholder="e.g. +91 98765 43210" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
            <View style={{ flexDirection: "row", gap: 10 }}>
                <Input label="Employee ID" required containerStyle={{ flex: 1 }} placeholder="e.g. EMP001" value={employeeId} onChangeText={setEmployeeId} />
                <View style={{ flex: 1 }}>
                    <DateField label="Date of Birth" required value={dob} onChange={setDob} maximumDate={new Date()} />
                </View>
            </View>
            <Input label="Designation" required placeholder="e.g. Site Engineer" value={designation} onChangeText={setDesignation} />
            <Select label="Report To" value={reportToId} onChange={setReportToId} allowClear searchable options={(slim.data ?? []).filter((m: any) => m.id !== member?.id).map((m: any) => ({ value: m.id, label: displayName(m.user ?? m), description: roleLabel(m.workspaceRole) }))} placeholder="Select Manager" />
            <Select label="Department" value={departmentId} onChange={setDepartmentId} allowClear options={(departments.data ?? []).map((d) => ({ value: d.id, label: d.name }))} placeholder="Select Department" />
            <Select label="Category" required value={role} onChange={(v) => v && setRole(v)} options={WORKSPACE_ROLES.filter((r) => r !== "OWNER").map((r) => ({ value: r, label: roleLabel(r) }))} />
        </Sheet>
    );
}

const styles = StyleSheet.create({
    grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -8 },
    cell: { width: "50%", padding: 8 },
});
