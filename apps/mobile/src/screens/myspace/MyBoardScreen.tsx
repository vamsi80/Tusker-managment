import { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, Plus, Trash2 } from "lucide-react-native";
import { myspaceApi } from "../../api/comms";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { qk } from "../../lib/query";
import { toast } from "../../lib/toast";
import { displayName } from "../../lib/format";
import { useTheme } from "../../theme/ThemeProvider";
import { fonts, radius } from "../../theme/tokens";
import { Avatar, Badge, Button, Card, Checkbox, EmptyState, ErrorState, Input, ListSkeleton, SearchBar, Sheet, Text, confirm, tint } from "../../components/ui";
import { Screen, ScreenHeader } from "../../components/layout/Screen";

type BoardItem = {
    id: string;
    note: string;
    status: "DONE" | "NOT_DONE";
    assignedById: string;
    assignedBy?: { workspaceRole?: string; user?: { name?: string | null; surname?: string | null } };
};
type Member = { id: string; workspaceRole: string; user?: { name?: string | null; surname?: string | null; image?: string | null }; boardItems: BoardItem[] };
type BoardData = { members: Member[]; isOwner: boolean; currentMemberId: string | null };

/** /w/[workspaceId]/my-board — board-client.tsx + member-board-card.tsx. */
export function MyBoardScreen() {
    const { colors } = useTheme();
    const qc = useQueryClient();
    const { workspaceId } = useWorkspace();
    const key = qk.board(workspaceId);
    const q = useQuery({ queryKey: key, queryFn: () => myspaceApi.board(workspaceId) as Promise<BoardData>, enabled: !!workspaceId });
    const data = q.data;
    const [search, setSearch] = useState("");
    const [addFor, setAddFor] = useState<string | null>(null);
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState<Record<string, boolean>>({});

    const members = useMemo(() => {
        const s = search.trim().toLowerCase();
        const list = data?.members ?? [];
        // Your own board first, then the team.
        const sorted = [...list].sort((a, b) => (a.id === data?.currentMemberId ? -1 : b.id === data?.currentMemberId ? 1 : 0));
        return s ? sorted.filter((m) => displayName(m.user).toLowerCase().includes(s)) : sorted;
    }, [data, search]);

    const patchItem = (itemId: string, fn: (item: BoardItem) => BoardItem | null) =>
        qc.setQueryData<BoardData>(key, (old) =>
            old
                ? {
                      ...old,
                      members: old.members.map((m) => ({
                          ...m,
                          boardItems: m.boardItems.flatMap((i) => {
                              if (i.id !== itemId) return [i];
                              const next = fn(i);
                              return next ? [next] : [];
                          }),
                      })),
                  }
                : old,
        );

    const add = useMutation({
        mutationFn: () => myspaceApi.addBoardItem(workspaceId, addFor!, note.trim()),
        onSuccess: () => {
            toast.success("Note added");
            setNote("");
            setAddFor(null);
            qc.invalidateQueries({ queryKey: key });
        },
        onError: (e) => toast.fromError(e, "Failed to add note"),
    });

    const toggle = async (item: BoardItem) => {
        setBusy((b) => ({ ...b, [item.id]: true }));
        patchItem(item.id, (i) => ({ ...i, status: i.status === "DONE" ? "NOT_DONE" : "DONE" }));
        try {
            await myspaceApi.toggleBoardItem(workspaceId, item.id, item.status);
        } catch (e) {
            toast.fromError(e, "Failed to update note");
            qc.invalidateQueries({ queryKey: key });
        } finally {
            setBusy((b) => ({ ...b, [item.id]: false }));
        }
    };

    const remove = async (item: BoardItem) => {
        if (!(await confirm({ title: "Delete this note?", message: "Are you sure you want to delete this note?", confirmLabel: "Delete", destructive: true }))) return;
        try {
            await myspaceApi.deleteBoardItem(workspaceId, item.id);
            patchItem(item.id, () => null);
            toast.success("Note deleted");
        } catch (e) {
            toast.fromError(e, "Failed to delete note");
        }
    };

    const target = data?.members.find((m) => m.id === addFor);

    return (
        <Screen>
            <ScreenHeader title="Workspace board" subtitle="Team updates and personal focus items" />
            <FlatList
                data={members}
                keyExtractor={(m) => m.id}
                contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 48 }}
                refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={colors.primaryInk} />}
                ListHeaderComponent={
                    <View style={{ gap: 12 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                            {data?.isOwner ? <Badge label="admin" color={colors.primaryInk} /> : null}
                            <View style={{ flex: 1 }} />
                            {data?.currentMemberId || data?.isOwner ? (
                                <Button title="Add note" icon={Plus} size="sm" onPress={() => setAddFor(data.currentMemberId ?? data.members[0]?.id ?? null)} />
                            ) : null}
                        </View>
                        {data?.isOwner && data.members.length > 4 ? <SearchBar value={search} onChangeText={setSearch} placeholder="Search members…" /> : null}
                    </View>
                }
                ListEmptyComponent={
                    q.isLoading ? (
                        <ListSkeleton rows={4} />
                    ) : q.isError ? (
                        <ErrorState message={(q.error as Error)?.message} onRetry={() => q.refetch()} />
                    ) : (
                        <EmptyState icon={ClipboardList} title="Nothing on the board" description="Notes you and your team add show up here." />
                    )
                }
                renderItem={({ item: member }) => {
                    const isSelf = member.id === data?.currentMemberId;
                    const canAddNote = !!data?.isOwner || isSelf;
                    return (
                        <Card padded={false}>
                            <View style={styles.cardHead}>
                                <Avatar name={displayName(member.user)} image={member.user?.image} size={40} />
                                <View style={{ flex: 1 }}>
                                    <Text variant="title" numberOfLines={1}>
                                        {displayName(member.user)}
                                        {isSelf ? <Text tone="muted"> (you)</Text> : null}
                                    </Text>
                                    <Text variant="small" tone="muted">
                                        {member.workspaceRole.replace("_", " ").toLowerCase()}
                                    </Text>
                                </View>
                                {canAddNote ? <Button title="Note" icon={Plus} size="sm" variant="outline" onPress={() => setAddFor(member.id)} /> : null}
                            </View>
                            <View style={[styles.rule, { backgroundColor: colors.border }]} />
                            <View style={{ padding: 12, gap: 8 }}>
                                {member.boardItems.length === 0 ? (
                                    <View style={styles.empty}>
                                        <View style={[styles.emptyDot, { borderColor: colors.mutedForeground }]} />
                                        <Text variant="caption" tone="muted" style={{ fontStyle: "italic" }}>
                                            No notes assigned yet
                                        </Text>
                                    </View>
                                ) : (
                                    member.boardItems.map((item) => {
                                        const isDone = item.status === "DONE";
                                        const assigner = item.assignedById === member.id ? "Self" : displayName(item.assignedBy?.user);
                                        const isAdminNote = item.assignedBy?.workspaceRole === "OWNER" || item.assignedBy?.workspaceRole === "ADMIN";
                                        // Admins delete anything; members delete their own notes, or notes on
                                        // their board unless an admin wrote them (member-board-card.tsx).
                                        const canDelete = !!data?.isOwner || (!isAdminNote && (item.assignedById === data?.currentMemberId || isSelf));
                                        return (
                                            <Pressable
                                                key={item.id}
                                                disabled={busy[item.id]}
                                                onPress={() => toggle(item)}
                                                style={[
                                                    styles.item,
                                                    isDone
                                                        ? { backgroundColor: tint(colors.muted, 0.5), borderColor: "transparent", opacity: 0.55 }
                                                        : { backgroundColor: tint(colors.accent, 0.6), borderColor: colors.border },
                                                ]}
                                            >
                                                <Checkbox checked={isDone} onChange={() => toggle(item)} disabled={busy[item.id]} />
                                                <View style={{ flex: 1, gap: 4 }}>
                                                    <Text
                                                        variant="body"
                                                        style={isDone ? { textDecorationLine: "line-through", color: colors.mutedForeground } : undefined}
                                                    >
                                                        {item.note}
                                                    </Text>
                                                    <Text variant="caption" tone="muted">
                                                        By {assigner}
                                                    </Text>
                                                </View>
                                                {canDelete ? (
                                                    <Pressable hitSlop={10} onPress={() => remove(item)} style={{ padding: 2 }}>
                                                        <Trash2 size={15} color={colors.mutedForeground} />
                                                    </Pressable>
                                                ) : null}
                                            </Pressable>
                                        );
                                    })
                                )}
                            </View>
                        </Card>
                    );
                }}
            />

            <Sheet
                open={!!addFor}
                onClose={() => setAddFor(null)}
                title="Add Note"
                description={`Create a new item for ${addFor === data?.currentMemberId ? "yourself" : target ? displayName(target.user) : "this team member"}.`}
                footer={
                    <>
                        <Button title="Cancel" variant="ghost" style={{ flex: 1 }} disabled={add.isPending} onPress={() => setAddFor(null)} />
                        <Button title={add.isPending ? "Adding..." : "Add Note"} style={{ flex: 1 }} loading={add.isPending} disabled={!note.trim()} onPress={() => add.mutate()} />
                    </>
                }
            >
                <Input
                    multiline
                    autoFocus
                    placeholder="Type your note here... (e.g. Finish the UI audit, Fix auth bug)"
                    value={note}
                    onChangeText={setNote}
                    style={{ minHeight: 120, fontFamily: fonts.body }}
                />
            </Sheet>
        </Screen>
    );
}

const styles = StyleSheet.create({
    cardHead: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, paddingBottom: 10 },
    rule: { height: 1, marginHorizontal: 12 },
    empty: { alignItems: "center", gap: 8, paddingVertical: 28, opacity: 0.5 },
    emptyDot: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderStyle: "dashed" },
    item: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 12, borderRadius: radius.lg, borderWidth: 1 },
});
