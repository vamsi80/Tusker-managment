import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Award, Trophy } from "lucide-react-native";
import { pointsApi } from "../../api/people";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { qk } from "../../lib/query";
import { fmtDate } from "../../lib/format";
import { toast } from "../../lib/toast";
import { useTheme } from "../../theme/ThemeProvider";
import { fonts, radius } from "../../theme/tokens";
import { Avatar, Button, Card, CardHeader, EmptyState, Input, ListSkeleton, Select, Sheet, Tabs, Text } from "../ui";
import { ScreenBody } from "../layout/Screen";

const PERIOD_LABEL: Record<string, string> = { WEEKLY: "This week", MONTHLY: "This month", QUARTERLY: "This quarter", YEARLY: "This year", NEVER: "All time" };

/** team/points — points-board.tsx: leaderboard, ledger, award / deduct. */
export function PointsTab() {
    const { colors } = useTheme();
    const qc = useQueryClient();
    const { workspaceId } = useWorkspace();
    const [memberId, setMemberId] = useState<string | undefined>();
    const [awarding, setAwarding] = useState(false);
    const summary = useQuery({ queryKey: qk.points(workspaceId), queryFn: () => pointsApi.summary(workspaceId), enabled: !!workspaceId });
    const entries = useInfiniteQuery({
        queryKey: ["points-entries", workspaceId, memberId ?? null],
        initialPageParam: undefined as string | undefined,
        queryFn: ({ pageParam }) => pointsApi.entries(workspaceId, { memberId, cursor: pageParam, limit: 20 }),
        getNextPageParam: (last: any) => last?.nextCursor ?? undefined,
        enabled: !!workspaceId,
    });
    const s = summary.data;
    const awardable = (s?.members ?? []).filter((m: any) => m.memberId !== s?.selfMemberId);
    const list = (entries.data?.pages ?? []).flatMap((p: any) => p?.entries ?? []);
    const selected = s?.members?.find((m: any) => m.memberId === memberId);

    return (
        <ScreenBody refreshing={summary.isRefetching} onRefresh={() => { summary.refetch(); entries.refetch(); }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={{ flex: 1 }}>
                    <Text variant="h2">{PERIOD_LABEL[s?.period ?? "MONTHLY"] ?? "This month"}</Text>
                    {s?.since ? (
                        <Text variant="caption" tone="muted">
                            Since {fmtDate(s.since)}
                        </Text>
                    ) : null}
                </View>
                {s?.canAward && awardable.length ? <Button size="sm" icon={Award} title="Award points" onPress={() => setAwarding(true)} /> : null}
            </View>

            <Card padded={false}>
                <CardHeader title="Leaderboard" icon={Trophy} />
                {summary.isLoading ? (
                    <View style={{ padding: 14 }}>
                        <ListSkeleton rows={4} />
                    </View>
                ) : !(s?.members ?? []).length ? (
                    <EmptyState title="No points yet" description="Points are earned by completing tasks on time." compact />
                ) : (
                    s.members.map((m: any, i: number) => (
                        <Pressable
                            key={m.memberId}
                            onPress={() => setMemberId(memberId === m.memberId ? undefined : m.memberId)}
                            style={[styles.row, { borderTopColor: colors.border, backgroundColor: memberId === m.memberId ? colors.accent : m.memberId === s.selfMemberId ? colors.secondary : "transparent" }]}
                        >
                            <Text style={{ width: 26, fontFamily: fonts.heading, fontSize: 15, color: i < 3 ? colors.primaryInk : colors.mutedForeground }}>{i + 1}</Text>
                            <Avatar name={m.name} image={m.image} size={32} />
                            <View style={{ flex: 1 }}>
                                <Text variant="bodyMedium">
                                    {m.name}
                                    {m.memberId === s.selfMemberId ? <Text tone="muted"> (you)</Text> : null}
                                </Text>
                                {m.designation ? (
                                    <Text variant="caption" tone="muted">
                                        {m.designation}
                                    </Text>
                                ) : null}
                            </View>
                            <Text style={{ fontFamily: fonts.heading, fontSize: 17, color: m.points < 0 ? colors.destructive : colors.foreground }}>{m.points}</Text>
                        </Pressable>
                    ))
                )}
            </Card>

            <Card padded={false}>
                <CardHeader
                    title={selected ? `${selected.name}'s history` : "Recent activity"}
                    right={selected ? <Button size="sm" variant="ghost" title="Show all" onPress={() => setMemberId(undefined)} /> : null}
                />
                {list.length === 0 && !entries.isLoading ? <EmptyState title="Nothing yet" compact /> : null}
                {list.map((e: any) => (
                    <View key={e.id} style={[styles.row, { borderTopColor: colors.border, opacity: e.reversedAt ? 0.5 : 1 }]}>
                        <View style={{ flex: 1, gap: 2 }}>
                            <Text variant="bodyMedium">{e.memberName}</Text>
                            <Text variant="caption" tone="muted" numberOfLines={2}>
                                {e.task?.name ?? e.reason}
                                {e.kind === "MANUAL" && e.awardedByName ? ` · by ${e.awardedByName}` : ""}
                            </Text>
                            <Text variant="caption" tone="muted">
                                {fmtDate(e.occurredAt, "dd MMM, h:mm a")}
                                {e.reversedAt ? " · reversed" : ""}
                            </Text>
                        </View>
                        <Text style={{ fontFamily: fonts.bold, fontSize: 15, color: e.points < 0 ? colors.destructive : colors.success }}>
                            {e.points > 0 ? "+" : ""}
                            {e.points}
                        </Text>
                    </View>
                ))}
                {entries.hasNextPage ? <Button variant="ghost" title="Load more" loading={entries.isFetchingNextPage} onPress={() => entries.fetchNextPage()} /> : null}
            </Card>

            {awarding ? (
                <AwardSheet
                    members={awardable}
                    onClose={() => setAwarding(false)}
                    onDone={() => {
                        qc.invalidateQueries({ queryKey: qk.points(workspaceId) });
                        qc.invalidateQueries({ queryKey: ["points-entries", workspaceId] });
                    }}
                />
            ) : null}
        </ScreenBody>
    );
}

function AwardSheet({ members, onClose, onDone }: { members: any[]; onClose: () => void; onDone: () => void }) {
    const { workspaceId } = useWorkspace();
    const [direction, setDirection] = useState<"award" | "deduct">("award");
    const [memberId, setMemberId] = useState<string | null>(null);
    const [points, setPoints] = useState("");
    const [reason, setReason] = useState("");
    const value = Math.round(Number(points));
    const valid = !!memberId && value > 0 && reason.trim().length > 0;
    const save = useMutation({
        mutationFn: () => pointsApi.award(workspaceId, { memberId: memberId!, points: direction === "award" ? value : -value, reason: reason.trim() }),
        onSuccess: () => {
            toast.success(direction === "award" ? "Points awarded" : "Points deducted");
            onDone();
            onClose();
        },
        onError: (e) => toast.fromError(e),
    });
    return (
        <Sheet
            open
            onClose={onClose}
            title="Award or deduct points"
            footer={
                <>
                    <Button title="Cancel" variant="ghost" style={{ flex: 1 }} onPress={onClose} />
                    <Button title={direction === "award" ? "Award" : "Deduct"} variant={direction === "award" ? "default" : "destructive"} style={{ flex: 1 }} disabled={!valid} loading={save.isPending} onPress={() => save.mutate()} />
                </>
            }
        >
            <Tabs scrollable={false} value={direction} onChange={setDirection} items={[{ key: "award", label: "Award" }, { key: "deduct", label: "Deduct" }]} />
            <Select label="Member" required value={memberId} onChange={setMemberId} options={members.map((m) => ({ value: m.memberId, label: m.name, description: m.designation ?? undefined }))} searchable />
            <Input label="Points" required keyboardType="number-pad" value={points} onChangeText={setPoints} />
            <Input label="Reason" required multiline value={reason} onChangeText={setReason} />
        </Sheet>
    );
}

const styles = StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: 1, borderRadius: radius.xs },
});
