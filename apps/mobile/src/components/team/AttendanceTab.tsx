import { useMemo, useState } from "react";
import { FlatList, RefreshControl, ScrollView, View } from "react-native";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addMonths, endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { ChevronLeft, ChevronRight, Download, LogIn, LogOut, MapPin, RefreshCcw } from "lucide-react-native";
import { attendanceApi } from "../../api/people";
import { workspacesApi } from "../../api/workspaces";
import { API_BASE, getToken } from "../../api/client";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { qk } from "../../lib/query";
import { ATTENDANCE_STATUS } from "../../lib/constants";
import { displayName, fmtDate, fmtTime, toDateOnlyString } from "../../lib/format";
import { toast } from "../../lib/toast";
import { useTheme } from "../../theme/ThemeProvider";
import { Avatar, Badge, Button, Card, Chip, EmptyState, ListSkeleton, MultiSelect, SearchBar, Sheet, Text, confirm } from "../ui";
import { AttendanceLogger } from "../attendance/AttendanceLogger";
import { useDebounced } from "../task/TaskFilters";

/** team/attendance — attendance-table.tsx: month view, filters, reconcile, export. */
export function AttendanceTab() {
    const { colors } = useTheme();
    const qc = useQueryClient();
    const { workspaceId, isAdmin } = useWorkspace();
    const [month, setMonth] = useState(new Date());
    const [status, setStatus] = useState<string[]>([]);
    const [memberIds, setMemberIds] = useState<string[]>([]);
    const [search, setSearch] = useState("");
    const [loggerOpen, setLoggerOpen] = useState(false);
    const [exportOpen, setExportOpen] = useState(false);
    const debounced = useDebounced(search);
    const members = useQuery({ queryKey: qk.membersSlim(workspaceId), queryFn: () => workspacesApi.membersSlim(workspaceId), enabled: isAdmin });

    const filters = {
        startDate: toDateOnlyString(startOfMonth(month)),
        endDate: toDateOnlyString(endOfMonth(month)),
        status,
        memberId: memberIds,
        search: debounced || undefined,
    };
    const q = useInfiniteQuery({
        queryKey: qk.attendance(workspaceId, filters),
        initialPageParam: 1,
        queryFn: ({ pageParam }) => attendanceApi.list(workspaceId, { ...filters, page: pageParam, pageSize: 30 }),
        getNextPageParam: (last, pages) => (pages.length * 30 < last.totalCount ? pages.length + 1 : undefined),
        enabled: !!workspaceId,
    });
    const records = useMemo(() => (q.data?.pages ?? []).flatMap((p) => p.records), [q.data]);
    const total = q.data?.pages[0]?.totalCount ?? 0;

    const reconcile = useMutation({
        mutationFn: () => attendanceApi.reconcile(workspaceId, new Date().toISOString()),
        onSuccess: (res: any) => {
            toast.success(`Successfully reconciled. Marked ${res?.data?.count ?? 0} members as absent.`);
            qc.invalidateQueries({ queryKey: ["attendance", workspaceId] });
        },
        onError: (e) => toast.fromError(e, "Failed to reconcile attendance"),
    });

    return (
        <>
            <FlatList
                data={records}
                keyExtractor={(r) => r.id ?? `${r.workspaceMemberId}-${r.date}`}
                contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 60 }}
                refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={colors.primaryInk} />}
                onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage()}
                onEndReachedThreshold={0.4}
                ListHeaderComponent={
                    <View style={{ gap: 10, marginBottom: 4 }}>
                        <Button icon={LogIn} title="Mark my attendance" onPress={() => setLoggerOpen(true)} />
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                            <Button size="iconSm" variant="outline" icon={ChevronLeft} onPress={() => setMonth((m) => subMonths(m, 1))} />
                            <Text variant="title" center style={{ flex: 1 }}>
                                {format(month, "MMMM yyyy")}
                            </Text>
                            <Button size="iconSm" variant="outline" icon={ChevronRight} onPress={() => setMonth((m) => addMonths(m, 1))} />
                        </View>
                        {isAdmin ? (
                            <View style={{ flexDirection: "row", gap: 8 }}>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    icon={RefreshCcw}
                                    title="Reconcile today"
                                    style={{ flex: 1 }}
                                    loading={reconcile.isPending}
                                    onPress={async () => {
                                        if (await confirm({ title: "Reconcile today's attendance?", message: "Members without a check-in or approved leave are marked absent." })) reconcile.mutate();
                                    }}
                                />
                                <Button size="sm" variant="outline" icon={Download} title="Export Excel" style={{ flex: 1 }} onPress={() => setExportOpen(true)} />
                            </View>
                        ) : null}
                        <SearchBar value={search} onChangeText={setSearch} placeholder="Search members…" />
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                            <MultiSelect
                                title="Status"
                                values={status}
                                onChange={setStatus}
                                options={Object.entries(ATTENDANCE_STATUS).map(([value, s]) => ({ value, label: s.label }))}
                                trigger={(open) => <Chip label={status.length ? `Status · ${status.length}` : "Status"} active={!!status.length} onPress={open} />}
                            />
                            {isAdmin ? (
                                <MultiSelect
                                    title="Members"
                                    values={memberIds}
                                    onChange={setMemberIds}
                                    searchable
                                    options={(members.data ?? []).map((m: any) => ({ value: m.id, label: displayName(m.user ?? m) }))}
                                    trigger={(open) => <Chip label={memberIds.length ? `Members · ${memberIds.length}` : "Members"} active={!!memberIds.length} onPress={open} />}
                                />
                            ) : null}
                        </ScrollView>
                        <Text variant="caption" tone="muted">
                            {total} records
                        </Text>
                    </View>
                }
                ListEmptyComponent={q.isLoading ? <ListSkeleton rows={6} /> : <EmptyState title="No attendance records" description="Records for this month and filter appear here." compact />}
                ListFooterComponent={q.isFetchingNextPage ? <ListSkeleton rows={1} /> : null}
                renderItem={({ item: r }) => {
                    const user = r.WorkspaceMember?.user ?? r.member?.user;
                    const s = ATTENDANCE_STATUS[r.status] ?? { label: r.status, tone: colors.mutedForeground };
                    return (
                        <Card style={{ gap: 8 }}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                                <Avatar name={displayName(user)} image={user?.image} size={34} />
                                <View style={{ flex: 1 }}>
                                    <Text variant="bodyMedium">{displayName(user)}</Text>
                                    <Text variant="caption" tone="muted">
                                        {fmtDate(r.date, "EEE, dd MMM yyyy")}
                                    </Text>
                                </View>
                                <Badge label={s.label} color={s.tone} size="xs" />
                            </View>
                            <View style={{ flexDirection: "row", gap: 16 }}>
                                <Stamp icon={LogIn} label="In" time={r.checkIn} />
                                <Stamp icon={LogOut} label="Out" time={r.checkOut} />
                            </View>
                            {r.checkInAddress || r.checkOutAddress ? (
                                <View style={{ flexDirection: "row", gap: 4, alignItems: "center" }}>
                                    <MapPin size={11} color={colors.mutedForeground} />
                                    <Text variant="caption" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
                                        {[r.checkInAddress, r.checkOutAddress].filter(Boolean).join(" → ")}
                                    </Text>
                                </View>
                            ) : null}
                            {r.checkInNotes || r.checkOutNotes ? (
                                <Text variant="caption" tone="muted" style={{ fontStyle: "italic" }}>
                                    {[r.checkInNotes, r.checkOutNotes].filter(Boolean).join(" · ")}
                                </Text>
                            ) : null}
                        </Card>
                    );
                }}
            />
            <Sheet open={loggerOpen} onClose={() => setLoggerOpen(false)}>
                <AttendanceLogger />
            </Sheet>
            {exportOpen ? <ExportSheet onClose={() => setExportOpen(false)} /> : null}
        </>
    );
}

function Stamp({ icon: Icon, label, time }: { icon: any; label: string; time?: string | null }) {
    const { colors } = useTheme();
    return (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <Icon size={13} color={colors.mutedForeground} />
            <Text variant="caption" tone="muted">
                {label}
            </Text>
            <Text variant="bodyMedium">{time ? fmtTime(time) : "—"}</Text>
        </View>
    );
}

/** The month picker + download of GET /attendance/export (an .xlsx). */
function ExportSheet({ onClose }: { onClose: () => void }) {
    const { workspaceId } = useWorkspace();
    const [date, setDate] = useState(new Date());
    const [busy, setBusy] = useState(false);
    const download = async () => {
        setBusy(true);
        try {
            const year = date.getFullYear();
            const monthNum = date.getMonth() + 1;
            const token = await getToken();
            const target = `${FileSystem.cacheDirectory}Attendance_${year}_${monthNum}.xlsx`;
            const res = await FileSystem.downloadAsync(`${API_BASE}/api/v1/attendance/export?year=${year}&month=${monthNum}`, target, {
                headers: { "x-workspace-id": workspaceId, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            });
            if (res.status !== 200) throw new Error("Only workspace admins can export attendance");
            await Sharing.shareAsync(res.uri, { mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", dialogTitle: `Attendance ${format(date, "MMMM yyyy")}` });
            onClose();
        } catch (e) {
            toast.fromError(e, "Export failed");
        } finally {
            setBusy(false);
        }
    };
    return (
        <Sheet
            open
            onClose={onClose}
            title="Export attendance"
            footer={
                <>
                    <Button title="Cancel" variant="outline" style={{ flex: 1 }} onPress={onClose} />
                    <Button icon={Download} title="Download" style={{ flex: 1 }} loading={busy} onPress={download} />
                </>
            }
        >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Button size="icon" variant="outline" icon={ChevronLeft} onPress={() => setDate((d) => subMonths(d, 1))} />
                <Text variant="h3" center style={{ flex: 1 }}>
                    {format(date, "MMMM yyyy")}
                </Text>
                <Button size="icon" variant="outline" icon={ChevronRight} onPress={() => setDate((d) => addMonths(d, 1))} />
            </View>
        </Sheet>
    );
}
