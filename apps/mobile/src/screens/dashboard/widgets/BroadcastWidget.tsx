import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Pencil, Send, Trash2, X } from "lucide-react-native";
import { workspacesApi, type Broadcast } from "../../../api/workspaces";
import { useWorkspace } from "../../../providers/WorkspaceProvider";
import { qk } from "../../../lib/query";
import { realtime, EVENTS } from "../../../lib/realtime";
import { fmtDate } from "../../../lib/format";
import { toast } from "../../../lib/toast";
import { useTheme } from "../../../theme/ThemeProvider";
import { fonts } from "../../../theme/tokens";
import { Button, Divider, Input, MultiSelect, Select, Text, confirm } from "../../../components/ui";
import { WidgetCard } from "./WidgetCard";
import { onColor } from "../../../theme/tone";

const VISIBILITY = [
    { value: "24", label: "Visible for 1 day" },
    { value: "72", label: "Visible for 3 days" },
    { value: "168", label: "Visible for 1 week" },
    { value: "720", label: "Visible for 30 days" },
    { value: "0", label: "Visible until removed" },
];

export function useBroadcasts() {
    const { workspaceId, layout } = useWorkspace();
    const qc = useQueryClient();
    const query = useQuery({
        queryKey: qk.broadcasts(workspaceId),
        queryFn: () => workspacesApi.broadcasts(workspaceId, 10),
        enabled: !!workspaceId,
        initialData: layout?.broadcasts,
    });
    useEffect(
        () =>
            realtime.subscribe(EVENTS.TEAM_UPDATE, (data) => {
                if (String(data?.action ?? "").includes("BROADCAST")) qc.invalidateQueries({ queryKey: qk.broadcasts(workspaceId) });
            }),
        [qc, workspaceId],
    );
    return query;
}

/** BroadcastTicker: the red "Broadcast" pill with a marquee of announcements. */
export function BroadcastTicker() {
    const { colors } = useTheme();
    const { width } = useWindowDimensions();
    const { data } = useBroadcasts();
    const items = data ?? [];
    const line = useMemo(
        () => items.map((b) => (b.title && b.title !== "Announcement" ? `${b.title} — ${b.body}` : b.body)).join("   •   "),
        [items],
    );
    const [trackWidth, setTrackWidth] = useState(0);
    const x = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (!trackWidth) return;
        x.setValue(0);
        const anim = Animated.loop(
            Animated.timing(x, { toValue: -trackWidth, duration: Math.max(12000, (line.length / 9) * 1000), easing: Easing.linear, useNativeDriver: true }),
        );
        anim.start();
        return () => anim.stop();
    }, [trackWidth, line, x]);

    if (items.length === 0) return null;

    return (
        <View style={[styles.ticker, { backgroundColor: colors.cardTranslucent, borderColor: colors.border }]}>
            <View style={[styles.tickerLabel, { backgroundColor: colors.broadcast }]}>
                <Megaphone size={14} color={onColor(colors.broadcast)} />
                <Text style={{ color: onColor(colors.broadcast), fontFamily: fonts.bold, fontSize: 11, letterSpacing: 1 }}>BROADCAST</Text>
            </View>
            <View style={{ flex: 1, overflow: "hidden" }}>
                <Animated.View style={{ flexDirection: "row", transform: [{ translateX: x }], width: Math.max(width * 4, trackWidth * 2 + 40) }}>
                    {[0, 1].map((copy) => (
                        <View key={copy} onLayout={copy === 0 ? (e) => setTrackWidth(e.nativeEvent.layout.width) : undefined} style={{ flexDirection: "row", alignItems: "center" }}>
                            <Text numberOfLines={1} style={{ paddingHorizontal: 16, fontFamily: fonts.medium, fontSize: 13 }}>
                                {line}
                            </Text>
                            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.broadcast }} />
                        </View>
                    ))}
                </Animated.View>
            </View>
        </View>
    );
}

/** BroadcastWidget: compose (title, message, departments, visibility), edit and delete. Admins only. */
export function BroadcastWidget() {
    const { workspaceId } = useWorkspace();
    const { colors } = useTheme();
    const qc = useQueryClient();
    const { data: broadcasts, isLoading } = useBroadcasts();
    const departments = useQuery({ queryKey: qk.departments(workspaceId), queryFn: () => workspacesApi.departments(workspaceId), enabled: !!workspaceId });

    const [title, setTitle] = useState("");
    const [message, setMessage] = useState("");
    const [visibleFor, setVisibleFor] = useState("168");
    const [deptIds, setDeptIds] = useState<string[]>([]);
    const [editingId, setEditingId] = useState<string | null>(null);

    const reset = () => {
        setTitle("");
        setMessage("");
        setDeptIds([]);
        setEditingId(null);
    };

    const save = useMutation({
        mutationFn: () => {
            const values = { title: title.trim() || undefined, message: message.trim(), expiresInHours: visibleFor === "0" ? null : Number(visibleFor), departmentIds: deptIds };
            return editingId ? workspacesApi.updateBroadcast(workspaceId, editingId, values) : workspacesApi.postBroadcast(workspaceId, values);
        },
        onSuccess: () => {
            toast.success(
                editingId
                    ? "Broadcast updated"
                    : deptIds.length
                      ? `Broadcast sent to ${deptIds.length} department${deptIds.length > 1 ? "s" : ""}`
                      : "Broadcast sent to the workspace",
            );
            reset();
            qc.invalidateQueries({ queryKey: qk.broadcasts(workspaceId) });
        },
        onError: (e) => toast.fromError(e, "Failed to save broadcast"),
    });

    const remove = useMutation({
        mutationFn: (id: string) => workspacesApi.deleteBroadcast(workspaceId, id),
        onSuccess: (_, id) => {
            if (editingId === id) reset();
            toast.success("Broadcast deleted");
            qc.invalidateQueries({ queryKey: qk.broadcasts(workspaceId) });
        },
        onError: (e) => toast.fromError(e, "Failed to delete broadcast"),
    });

    const startEditing = (b: Broadcast) => {
        if (!b.entityId) return;
        setEditingId(b.entityId);
        setTitle(b.title === "Announcement" ? "" : b.title);
        setMessage(b.body);
        setVisibleFor(b.metadata?.expiresAt ? visibleFor : "0");
    };

    return (
        <WidgetCard title="Broadcast" icon={Megaphone} meta={editingId ? "Editing" : "To the workspace"}>
            <View style={{ gap: 10 }}>
                <Input placeholder="Title (optional)" value={title} onChangeText={setTitle} maxLength={120} />
                <Input placeholder={deptIds.length ? "Message to the selected departments…" : "Message to everyone in the workspace…"} multiline value={message} onChangeText={setMessage} maxLength={2000} />
                <View style={{ flexDirection: "row", gap: 8 }}>
                    <View style={{ flex: 1 }}>
                        <MultiSelect
                            placeholder="All departments"
                            title="Send to departments"
                            values={deptIds}
                            onChange={setDeptIds}
                            options={(departments.data ?? []).map((d) => ({ value: d.id, label: d.name }))}
                        />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Select value={visibleFor} onChange={(v) => v && setVisibleFor(v)} options={VISIBILITY} title="Visibility" />
                    </View>
                </View>
                <View style={{ flexDirection: "row", gap: 8 }}>
                    <Button style={{ flex: 1 }} icon={Send} title={editingId ? "Update" : "Send"} loading={save.isPending} disabled={!message.trim()} onPress={() => save.mutate()} />
                    {editingId ? <Button variant="outline" size="icon" icon={X} onPress={reset} /> : null}
                </View>
            </View>
            <Divider />
            {isLoading ? null : !broadcasts?.length ? (
                <Text variant="small" tone="muted" center style={{ fontStyle: "italic", paddingVertical: 12 }}>
                    No announcements yet
                </Text>
            ) : (
                broadcasts.map((b, i) => (
                    <View key={b.id} style={{ gap: 2, paddingTop: i === 0 ? 0 : 10, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <Text variant="bodyMedium" weight="semibold" style={{ flex: 1 }} numberOfLines={1}>
                                {b.title}
                            </Text>
                            <Text variant="caption" tone="muted">
                                {fmtDate(b.createdAt, "MMM d")}
                            </Text>
                            {b.entityId ? (
                                <>
                                    <Pressable hitSlop={8} onPress={() => startEditing(b)} style={{ padding: 4 }}>
                                        <Pencil size={13} color={colors.mutedForeground} />
                                    </Pressable>
                                    <Pressable
                                        hitSlop={8}
                                        style={{ padding: 4 }}
                                        onPress={async () => {
                                            if (await confirm({ title: "Delete this broadcast?", message: "It disappears for everyone in the workspace. This cannot be undone.", confirmLabel: "Delete", destructive: true }))
                                                remove.mutate(b.entityId!);
                                        }}
                                    >
                                        <Trash2 size={13} color={colors.mutedForeground} />
                                    </Pressable>
                                </>
                            ) : null}
                        </View>
                        <Text variant="body" tone="muted">
                            {b.body}
                        </Text>
                        <Text variant="caption" tone="muted" style={{ opacity: 0.8 }}>
                            {[
                                b.metadata?.senderName ? `— ${b.metadata.senderName}` : null,
                                b.metadata?.departmentNames?.length ? `to ${b.metadata.departmentNames.join(", ")}` : null,
                                b.metadata?.expiresAt ? `until ${fmtDate(b.metadata.expiresAt, "MMM d")}` : null,
                            ]
                                .filter(Boolean)
                                .join(" · ")}
                        </Text>
                    </View>
                ))
            )}
        </WidgetCard>
    );
}

const styles = StyleSheet.create({
    ticker: { flexDirection: "row", alignItems: "center", borderRadius: 999, borderWidth: 1, overflow: "hidden", height: 40 },
    tickerLabel: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, alignSelf: "stretch", borderRadius: 999 },
});
