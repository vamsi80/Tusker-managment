import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, CheckCircle2, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, ClipboardList, Clock, FileText, X } from "lucide-react-native";
import { reportsApi } from "../../api/people";
import { workspacesApi } from "../../api/workspaces";
import { useAuth } from "../../providers/AuthProvider";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { qk } from "../../lib/query";
import { displayName, fmtDate, fmtTime } from "../../lib/format";
import { useTheme } from "../../theme/ThemeProvider";
import { fonts, radius } from "../../theme/tokens";
import { Avatar, Badge, DateField, EmptyState, ErrorState, ListSkeleton, MultiSelect, SearchBar, Text } from "../../components/ui";
import { Screen, ScreenHeader } from "../../components/layout/Screen";
import { DailyReportSheet } from "../../components/reports/DailyReportSheet";

const PAGE = 30;

type Report = {
    id: string;
    userId: string;
    user?: { id?: string; name?: string | null; surname?: string | null; email?: string | null; image?: string | null };
    status: "SUBMITTED" | "ABSENT" | "NOT_SUBMITTED";
    submittedAt?: string | null;
    date: string;
    entries: { id: string; description: string; task?: { name?: string; taskSlug?: string; project?: { color?: string } } | null }[];
    description?: string;
};

type Row =
    | { type: "date"; key: string; date: string; count: number }
    | { type: "user"; key: string; report: Report }
    | { type: "entry"; key: string; report: Report; entry: Report["entries"][number] | null; text?: string };

const dateKey = (date?: string | null) => (date ? String(date).split("T")[0] : "No Date");

/**
 * /w/[workspaceId]/reports — report-table.tsx: days → people → work logs,
 * with every member listed for each day (missing ones as Not Submitted),
 * plus DailyReportFAB.tsx for submitting today's report.
 */
export function ReportsScreen() {
    const { colors, shadow } = useTheme();
    const qc = useQueryClient();
    const auth = useAuth();
    const currentUserId = auth.status === "signedIn" ? auth.user.id : "";
    const { workspaceId, isAdmin } = useWorkspace();
    const [date, setDate] = useState<Date | null>(null);
    const [userIds, setUserIds] = useState<string[]>([]);
    const [search, setSearch] = useState("");
    const [expandedDates, setExpandedDates] = useState<Record<string, boolean>>({});
    const [expandedReports, setExpandedReports] = useState<Record<string, boolean>>({});
    const [sheetOpen, setSheetOpen] = useState(false);

    const filters = { date: date ? fmtDate(date, "d MMM yyyy") : undefined, userId: isAdmin && userIds.length ? userIds : undefined };
    const q = useInfiniteQuery({
        queryKey: qk.reports(workspaceId, filters),
        enabled: !!workspaceId,
        initialPageParam: 0,
        queryFn: ({ pageParam }) => reportsApi.list(workspaceId, { ...filters, skip: pageParam, take: PAGE }) as Promise<Report[]>,
        getNextPageParam: (last, pages) => (last.length >= PAGE ? pages.length * PAGE : undefined),
    });
    const members = useQuery({ queryKey: qk.membersSlim(workspaceId), queryFn: () => workspacesApi.membersSlim(workspaceId), enabled: !!workspaceId });
    const status = useQuery({ queryKey: [...qk.reportForm(workspaceId), "status"], queryFn: () => reportsApi.status(workspaceId), enabled: !!workspaceId });
    const submitted = status.data?.status === "SUBMITTED";

    // Every day on screen lists each member in scope; a missing report is a virtual NOT_SUBMITTED row.
    const byDate = useMemo(() => {
        const groups: Record<string, Report[]> = {};
        for (const r of q.data?.pages.flat() ?? []) (groups[dateKey(r.date)] ??= []).push(r);
        const selectedKey = date ? fmtDate(date, "yyyy-MM-dd") : null;
        const keys = Array.from(new Set([...Object.keys(groups), ...(selectedKey ? [selectedKey] : [])])).sort((a, b) => b.localeCompare(a));
        const all: any[] = members.data ?? [];
        const scope = isAdmin ? (userIds.length ? all.filter((m) => userIds.includes(m.userId)) : all) : all.filter((m) => m.userId === currentUserId);
        const result: Record<string, Report[]> = {};
        for (const key of keys) {
            const reports = groups[key] ?? [];
            const byUser = new Map<string, Report>();
            for (const r of reports) {
                const id = r.userId || r.user?.id || r.user?.email || r.id;
                if (id && !byUser.has(id)) byUser.set(id, r);
            }
            result[key] = scope.length
                ? scope.map(
                      (m) =>
                          byUser.get(m.userId) ??
                          ({ id: `virtual-${key}-${m.id}`, userId: m.userId, user: m, status: "NOT_SUBMITTED", submittedAt: null, date: key, entries: [], description: "Not yet submitted." } as Report),
                  )
                : reports;
        }
        return result;
    }, [q.data, members.data, isAdmin, userIds, currentUserId, date]);

    const matches = (r: Report) => {
        const s = search.trim().toLowerCase();
        if (!s) return true;
        const name = `${r.user?.name ?? ""} ${r.user?.surname ?? ""} ${r.user?.email ?? ""}`.toLowerCase();
        return (
            name.includes(s) ||
            (r.description ?? "").toLowerCase().includes(s) ||
            r.entries.some((e) => [e.task?.name, e.task?.taskSlug, e.description].some((v) => (v ?? "").toLowerCase().includes(s)))
        );
    };

    const rows = useMemo(() => {
        const out: Row[] = [];
        const keys = Object.keys(byDate).sort((a, b) => b.localeCompare(a));
        keys.forEach((key, i) => {
            const reports = byDate[key].filter(matches);
            if (!reports.length) return;
            out.push({ type: "date", key: `d-${key}`, date: key, count: reports.length });
            // The newest day starts open, as the place you're most likely to look.
            if (!(expandedDates[key] ?? i === 0)) return;
            for (const report of [...reports].sort((a, b) => displayName(a.user).localeCompare(displayName(b.user)))) {
                out.push({ type: "user", key: `r-${report.id}`, report });
                if (!expandedReports[report.id]) continue;
                if (!report.entries?.length) {
                    out.push({
                        type: "entry",
                        key: `empty-${report.id}`,
                        report,
                        entry: null,
                        text:
                            report.status === "ABSENT"
                                ? "No report submitted (Absent)."
                                : report.status === "NOT_SUBMITTED"
                                  ? "Activity pending: No work logs recorded for this day yet."
                                  : "Empty report: Submitted without logs.",
                    });
                } else report.entries.forEach((entry) => out.push({ type: "entry", key: `e-${entry.id}`, report, entry }));
            }
        });
        return out;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [byDate, expandedDates, expandedReports, search]);

    const firstKey = Object.keys(byDate).sort((a, b) => b.localeCompare(a))[0];
    const isDateOpen = (key: string) => expandedDates[key] ?? key === firstKey;
    const anyExpanded = Object.keys(byDate).some(isDateOpen);
    const toggleAll = () => {
        if (anyExpanded) {
            setExpandedDates(Object.fromEntries(Object.keys(byDate).map((k) => [k, false])));
            setExpandedReports({});
        } else {
            const dates: Record<string, boolean> = {};
            const reports: Record<string, boolean> = {};
            for (const [key, list] of Object.entries(byDate)) {
                const visible = list.filter(matches);
                if (!visible.length) continue;
                dates[key] = true;
                visible.forEach((r) => (reports[r.id] = true));
            }
            setExpandedDates(dates);
            setExpandedReports(reports);
        }
    };

    const statusColor = (s: Report["status"]) => (s === "SUBMITTED" ? colors.success : s === "ABSENT" ? colors.destructive : colors.warning);

    return (
        <Screen>
            <ScreenHeader title="Daily Reports" />
            <FlatList
                data={rows}
                keyExtractor={(r) => r.key}
                contentContainerStyle={{ paddingBottom: 120 }}
                refreshControl={
                    <RefreshControl
                        refreshing={q.isRefetching && !q.isFetchingNextPage}
                        onRefresh={() => {
                            q.refetch();
                            status.refetch();
                        }}
                        tintColor={colors.primaryInk}
                    />
                }
                ListHeaderComponent={
                    <View style={{ padding: 16, gap: 10 }}>
                        <SearchBar value={search} onChangeText={setSearch} placeholder="Search assignees, tasks, or logs..." />
                        <View style={{ flexDirection: "row", gap: 10 }}>
                            <View style={{ flex: 1 }}>
                                <DateField value={date} onChange={setDate} placeholder="Any date" clearable maximumDate={new Date()} />
                            </View>
                            {isAdmin ? (
                                <View style={{ flex: 1 }}>
                                    <MultiSelect
                                        values={userIds}
                                        onChange={setUserIds}
                                        searchable
                                        title="Assignees"
                                        placeholder={members.isLoading ? "Loading Members..." : "All Assignees"}
                                        options={(members.data ?? []).map((m: any) => ({ value: m.userId, label: m.surname || m.name || m.email || "Unnamed member" }))}
                                    />
                                </View>
                            ) : null}
                        </View>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                            <Pressable hitSlop={8} onPress={toggleAll} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                                {anyExpanded ? <ChevronsDownUp size={15} color={colors.mutedForeground} /> : <ChevronsUpDown size={15} color={colors.mutedForeground} />}
                                <Text variant="label" tone="muted">
                                    {anyExpanded ? "Collapse all" : "Expand all"}
                                </Text>
                            </Pressable>
                            <View style={{ flex: 1 }} />
                            {date || userIds.length ? (
                                <Pressable
                                    hitSlop={8}
                                    onPress={() => {
                                        setDate(null);
                                        setUserIds([]);
                                    }}
                                    style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
                                >
                                    <X size={14} color={colors.mutedForeground} />
                                    <Text variant="label" tone="muted">
                                        Clear filters
                                    </Text>
                                </Pressable>
                            ) : null}
                        </View>
                    </View>
                }
                ListEmptyComponent={
                    q.isLoading ? (
                        <View style={{ paddingHorizontal: 16 }}>
                            <ListSkeleton rows={6} />
                        </View>
                    ) : q.isError ? (
                        <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />
                    ) : (
                        <EmptyState icon={FileText} title="No reports found" description="Try adjusting your filters or search query to find activity logs." />
                    )
                }
                onEndReachedThreshold={0.5}
                onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage()}
                ListFooterComponent={q.isFetchingNextPage ? <ActivityIndicator color={colors.primaryInk} style={{ margin: 16 }} /> : null}
                renderItem={({ item }) => {
                    if (item.type === "date") {
                        const open = isDateOpen(item.date);
                        return (
                            <Pressable
                                onPress={() => setExpandedDates((d) => ({ ...d, [item.date]: !open }))}
                                style={[styles.dateRow, { backgroundColor: colors.muted, borderTopColor: colors.border }]}
                            >
                                {open ? <ChevronDown size={15} color={colors.mutedForeground} /> : <ChevronRight size={15} color={colors.mutedForeground} />}
                                <CalendarDays size={15} color={colors.primaryInk} />
                                <Text variant="title" style={{ flex: 1, fontSize: 14 }}>
                                    {item.date === "No Date" ? "No Date" : fmtDate(`${item.date}T12:00:00`, "dd MMM yyyy")}
                                </Text>
                                <Badge label={`${item.count} reports`} variant="muted" size="xs" />
                            </Pressable>
                        );
                    }
                    if (item.type === "user") {
                        const { report } = item;
                        const open = !!expandedReports[report.id];
                        return (
                            <Pressable
                                onPress={() => setExpandedReports((r) => ({ ...r, [report.id]: !open }))}
                                style={({ pressed }) => [styles.userRow, { borderTopColor: colors.border, backgroundColor: pressed ? colors.secondary : "transparent" }]}
                            >
                                {open ? <ChevronDown size={14} color={colors.mutedForeground} /> : <ChevronRight size={14} color={colors.mutedForeground} />}
                                <Avatar name={displayName(report.user)} image={report.user?.image} size={28} />
                                <Text variant="bodyMedium" numberOfLines={1} style={{ flex: 1 }}>
                                    {displayName(report.user)}
                                </Text>
                                <Badge label={report.status.replace("_", " ")} color={statusColor(report.status)} size="xs" variant={report.status === "ABSENT" ? "solid" : "soft"} />
                            </Pressable>
                        );
                    }
                    const { entry, report } = item;
                    return (
                        <View style={[styles.entryRow, { borderLeftColor: colors.border }]}>
                            {entry ? (
                                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                                    <View style={[styles.dot, { backgroundColor: entry.task?.project?.color || "#cbd5e1" }]} />
                                    <Text variant="label" numberOfLines={1} style={{ flex: 1 }}>
                                        {entry.task?.name || "Other Work"}
                                    </Text>
                                    {report.submittedAt ? (
                                        <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                                            <Clock size={10} color={colors.mutedForeground} />
                                            <Text variant="mono" tone="muted" style={{ fontSize: 10 }}>
                                                {fmtTime(report.submittedAt)}
                                            </Text>
                                        </View>
                                    ) : null}
                                </View>
                            ) : (
                                <View style={[styles.pill, { borderColor: colors.border, backgroundColor: colors.muted }]}>
                                    <Text variant="caption" tone="muted" style={{ fontStyle: "italic" }}>
                                        {report.status === "ABSENT" ? "Absent" : "Other Work"}
                                    </Text>
                                </View>
                            )}
                            <Text variant="body" style={{ color: colors.foreground, opacity: 0.9 }}>
                                {entry ? entry.description || "-" : item.text}
                            </Text>
                        </View>
                    );
                }}
            />

            <Pressable
                onPress={() => setSheetOpen(true)}
                style={({ pressed }) => [
                    styles.fab,
                    shadow.lg,
                    submitted ? { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 } : { backgroundColor: colors.primary },
                    { transform: [{ scale: pressed ? 0.96 : 1 }] },
                ]}
            >
                {status.isLoading ? (
                    <ActivityIndicator size="small" color={colors.mutedForeground} />
                ) : submitted ? (
                    <CheckCircle2 size={19} color={colors.success} />
                ) : (
                    <ClipboardList size={19} color={colors.primaryForeground} />
                )}
                <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: submitted ? colors.foreground : colors.primaryForeground }}>
                    {status.isLoading ? "Daily report" : submitted ? "Report Submitted" : "Report Missing"}
                </Text>
            </Pressable>

            <DailyReportSheet
                workspaceId={workspaceId}
                open={sheetOpen}
                onClose={() => setSheetOpen(false)}
                onSubmitted={() => {
                    qc.setQueryData([...qk.reportForm(workspaceId), "status"], { status: "SUBMITTED" });
                    qc.invalidateQueries({ queryKey: qk.reports(workspaceId) });
                }}
            />
        </Screen>
    );
}

const styles = StyleSheet.create({
    dateRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 11, borderTopWidth: 1 },
    userRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingLeft: 30, paddingRight: 16, paddingVertical: 10, borderTopWidth: 1 },
    entryRow: { gap: 6, marginLeft: 52, marginRight: 16, paddingLeft: 12, paddingVertical: 10, borderLeftWidth: 2 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    pill: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm, borderWidth: 1, borderStyle: "dashed" },
    fab: { position: "absolute", right: 20, bottom: 32, flexDirection: "row", alignItems: "center", gap: 8, height: 50, paddingHorizontal: 20, borderRadius: 999 },
});
