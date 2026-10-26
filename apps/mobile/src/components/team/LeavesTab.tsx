import { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { differenceInCalendarDays } from "date-fns";
import { CalendarPlus, Check, MoreHorizontal, Pencil, Trash2, X } from "lucide-react-native";
import { leavesApi } from "../../api/people";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { qk } from "../../lib/query";
import { LEAVE_STATUS_TONE, LEAVE_TYPES } from "../../lib/constants";
import { displayName, fmtDate, toDateOnlyString } from "../../lib/format";
import { toast } from "../../lib/toast";
import { useTheme } from "../../theme/ThemeProvider";
import { fonts, radius } from "../../theme/tokens";
import { ActionMenu, Avatar, Badge, Button, Card, DateField, EmptyState, Input, ListSkeleton, SearchBar, Sheet, Tabs, Text, confirm } from "../ui";
import { useDebounced } from "../task/TaskFilters";

/** team/leaves — leaves-table.tsx with leave-request-dialog.tsx. */
export function LeavesTab() {
    const { colors } = useTheme();
    const qc = useQueryClient();
    const { workspaceId, isAdmin, role, permissions } = useWorkspace();
    const [search, setSearch] = useState("");
    const [form, setForm] = useState<any | "new" | null>(null);
    const [menu, setMenu] = useState<any | null>(null);
    const debounced = useDebounced(search);
    const myMemberId = permissions?.workspaceMemberId;

    const balance = useQuery({ queryKey: qk.leaveBalance(workspaceId), queryFn: () => leavesApi.balance(workspaceId), enabled: !!workspaceId });
    const q = useInfiniteQuery({
        queryKey: qk.leaves(workspaceId, debounced),
        initialPageParam: 1,
        queryFn: ({ pageParam }) => leavesApi.list(workspaceId, { page: pageParam, pageSize: 20, search: debounced || undefined }),
        getNextPageParam: (last, pages) => (pages.length * 20 < last.totalCount ? pages.length + 1 : undefined),
        enabled: !!workspaceId,
    });
    const leaves = useMemo(() => (q.data?.pages ?? []).flatMap((p) => p.leaves), [q.data]);
    const refresh = () => {
        qc.invalidateQueries({ queryKey: ["leaves", workspaceId] });
        qc.invalidateQueries({ queryKey: qk.leaveBalance(workspaceId) });
        qc.invalidateQueries({ queryKey: ["calendar", workspaceId] });
    };

    const decide = useMutation({
        mutationFn: ({ id, status }: { id: string; status: "APPROVED" | "REJECTED" }) => leavesApi.setStatus(workspaceId, id, status),
        onSuccess: (_, { status }) => {
            toast.success(status === "APPROVED" ? "Leave approved" : "Leave rejected");
            refresh();
        },
        onError: (e) => toast.fromError(e),
    });
    const remove = useMutation({
        mutationFn: (id: string) => leavesApi.remove(workspaceId, id),
        onSuccess: () => {
            toast.success("Leave request deleted");
            refresh();
        },
        onError: (e) => toast.fromError(e),
    });

    // Admins decide anything; a manager decides their own reports' requests.
    const canDecide = (l: any) => l.status === "PENDING" && l.workspaceMemberId !== myMemberId && (isAdmin || (role === "MANAGER" && l.reportToId === myMemberId));
    const isMine = (l: any) => l.workspaceMemberId === myMemberId;

    return (
        <>
            <FlatList
                data={leaves}
                keyExtractor={(l) => l.id}
                contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 60 }}
                refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => { q.refetch(); balance.refetch(); }} tintColor={colors.primaryInk} />}
                onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage()}
                ListHeaderComponent={
                    <View style={{ gap: 12, marginBottom: 4 }}>
                        <View style={{ flexDirection: "row", gap: 10 }}>
                            <BalanceTile label="Casual leave" value={balance.data?.casualLeaveBalance} color={colors.info} />
                            <BalanceTile label="Sick leave" value={balance.data?.sickLeaveBalance} color={colors.leave} />
                        </View>
                        {balance.data?.accrualThreshold ? (
                            <Text variant="caption" tone="muted">
                                One casual leave accrues every {balance.data.accrualThreshold} working days.
                            </Text>
                        ) : null}
                        <Button icon={CalendarPlus} title="Apply for leave" onPress={() => setForm("new")} />
                        <SearchBar value={search} onChangeText={setSearch} placeholder="Search by member or reason…" />
                    </View>
                }
                ListEmptyComponent={q.isLoading ? <ListSkeleton rows={5} /> : <EmptyState title="No leave requests" compact />}
                renderItem={({ item: l }) => {
                    const days = differenceInCalendarDays(new Date(l.endDate), new Date(l.startDate)) + 1;
                    return (
                        <Card style={{ gap: 10 }}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                                <Avatar name={displayName(l)} image={l.image} size={36} />
                                <View style={{ flex: 1 }}>
                                    <Text variant="bodyMedium">{displayName(l)}</Text>
                                    <Text variant="caption" tone="muted">
                                        {LEAVE_TYPES.find((t) => t.value === l.type)?.label ?? l.type} · {days} day{days > 1 ? "s" : ""}
                                    </Text>
                                </View>
                                <Badge label={l.status.charAt(0) + l.status.slice(1).toLowerCase()} color={LEAVE_STATUS_TONE[l.status]} size="xs" />
                                {isMine(l) && l.status === "PENDING" ? (
                                    <Pressable hitSlop={8} onPress={() => setMenu(l)}>
                                        <MoreHorizontal size={18} color={colors.mutedForeground} />
                                    </Pressable>
                                ) : null}
                            </View>
                            <Text variant="small" weight="semibold">
                                {fmtDate(l.startDate, "dd MMM")}
                                {l.endDate !== l.startDate ? ` – ${fmtDate(l.endDate, "dd MMM yyyy")}` : `, ${fmtDate(l.startDate, "yyyy")}`}
                            </Text>
                            <Text variant="body" tone="muted">
                                {l.reason}
                            </Text>
                            {l.processedByName ? (
                                <Text variant="caption" tone="muted">
                                    {l.status === "APPROVED" ? "Approved" : "Processed"} by {l.processedByName}
                                </Text>
                            ) : null}
                            {canDecide(l) ? (
                                <View style={{ flexDirection: "row", gap: 8 }}>
                                    <Button size="sm" variant="destructiveOutline" icon={X} title="Reject" style={{ flex: 1 }} onPress={() => decide.mutate({ id: l.id, status: "REJECTED" })} />
                                    <Button size="sm" variant="success" icon={Check} title="Approve Request" style={{ flex: 1.5 }} onPress={() => decide.mutate({ id: l.id, status: "APPROVED" })} />
                                </View>
                            ) : null}
                        </Card>
                    );
                }}
            />
            <ActionMenu
                open={!!menu}
                onClose={() => setMenu(null)}
                title="Your leave request"
                actions={[
                    { label: "Edit", icon: Pencil, onPress: () => setForm(menu) },
                    {
                        label: "Delete request",
                        icon: Trash2,
                        destructive: true,
                        onPress: async () => {
                            if (await confirm({ title: "Delete this leave request?", confirmLabel: "Delete", destructive: true })) remove.mutate(menu.id);
                        },
                    },
                ]}
            />
            {form ? <LeaveRequestSheet initial={form === "new" ? null : form} onClose={() => setForm(null)} onSaved={refresh} /> : null}
        </>
    );
}

function BalanceTile({ label, value, color }: { label: string; value?: number; color: string }) {
    const { colors } = useTheme();
    return (
        <View style={[styles.tile, { backgroundColor: colors.card, borderColor: color + "40" }]}>
            <Text variant="overline" color={color}>
                {label}
            </Text>
            <Text style={{ fontFamily: fonts.heading, fontSize: 28, color: colors.foreground }}>{value ?? "–"}</Text>
            <Text variant="caption" tone="muted">
                days available
            </Text>
        </View>
    );
}

/** leaveRequestSchema: type, date range (not in the past), reason ≥ 10 chars. */
export function LeaveRequestSheet({ initial, onClose, onSaved }: { initial: any | null; onClose: () => void; onSaved: () => void }) {
    const { colors } = useTheme();
    const { workspaceId } = useWorkspace();
    const [type, setType] = useState<"CASUAL" | "SICK">(initial?.type ?? "CASUAL");
    const [from, setFrom] = useState<Date | null>(initial ? new Date(initial.startDate) : null);
    const [to, setTo] = useState<Date | null>(initial ? new Date(initial.endDate) : null);
    const [reason, setReason] = useState(initial?.reason ?? "");
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const save = useMutation({
        mutationFn: () => {
            if (!from) throw new Error("Please select your leave dates");
            if (from < today) throw new Error("Start date cannot be in the past");
            if (to && to < from) throw new Error("End date must be on or after the start date");
            if (reason.trim().length < 10) throw new Error("Reason must be at least 10 characters.");
            const body = { type, startDate: toDateOnlyString(from), endDate: toDateOnlyString(to ?? from), reason: reason.trim() };
            return initial ? leavesApi.update(workspaceId, initial.id, body) : leavesApi.create(workspaceId, body);
        },
        onSuccess: () => {
            toast.success(initial ? "Leave request updated" : "Leave request submitted");
            onSaved();
            onClose();
        },
        onError: (e) => toast.fromError(e, "Failed to submit leave request"),
    });

    return (
        <Sheet
            open
            onClose={onClose}
            title={initial ? "Edit leave request" : "Apply for leave"}
            footer={
                <>
                    <Button title="Cancel" variant="outline" style={{ flex: 1 }} onPress={onClose} />
                    <Button title={initial ? "Save" : "Submit request"} style={{ flex: 1.3 }} loading={save.isPending} onPress={() => save.mutate()} />
                </>
            }
        >
            <Tabs scrollable={false} value={type} onChange={setType} items={LEAVE_TYPES.map((t) => ({ key: t.value, label: `${t.label} leave` }))} />
            <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>
                    <DateField label="From" required value={from} onChange={(d) => { setFrom(d); if (d && to && to < d) setTo(d); }} minimumDate={today} />
                </View>
                <View style={{ flex: 1 }}>
                    <DateField label="To" value={to} onChange={setTo} minimumDate={from ?? today} clearable placeholder="Same day" />
                </View>
            </View>
            <Input label="Reason for Leave" required multiline placeholder="At least 10 characters" value={reason} onChangeText={setReason} />
            <Text variant="caption" tone="muted" style={{ color: colors.mutedForeground }}>
                Your manager is notified and can approve or reject it.
            </Text>
        </Sheet>
    );
}

const styles = StyleSheet.create({
    tile: { flex: 1, borderWidth: 1, borderRadius: radius.lg, padding: 14, gap: 2 },
});
