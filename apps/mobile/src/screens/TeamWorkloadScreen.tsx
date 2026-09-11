import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, FlatList, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList, WorkspaceMember, User } from "../types";
import { useTheme } from "../context/ThemeContext";
import { useWorkspace } from "../context/WorkspaceContext";
import { ListSkeleton } from "../components/ScreenSkeleton";
import { getWorkspaceMembers, getCachedSession } from "../services/api";
import { getUserDisplayName, getUserDisplayInitial } from "../utils/userDisplayName";
import { SPACING, BORDER_RADIUS, TOUCH_TARGET, FONTS } from "../constants/theme";
import PressableScale from "../components/PressableScale";
import EmptyState from "../components/EmptyState";
import MemberDetailModal from "../components/MemberDetailModal";

type Props = NativeStackScreenProps<RootStackParamList, "TeamWorkload">;

type WorkloadFilter = "all" | "zero" | "gt5" | "gt10";

const FILTERS: { value: WorkloadFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "zero", label: "0 tasks" },
    { value: "gt5", label: ">5 tasks" },
    { value: "gt10", label: ">10 tasks" },
];

/** Mirrors the web team dashboard's tasksAssigned column thresholds. */
function taskCountColor(count: number) {
    if (count === 0) return "#94a3b8";
    if (count < 5) return "#10b981";
    if (count < 10) return "#f59e0b";
    return "#f43f5e";
}

/**
 * Full "Team Workload" list — reached from the Home screen's quick-access
 * tile. Headcount workload is management information on the web dashboard
 * too (team-members-table.tsx canSeeWorkload) — owners, admins and managers
 * only — so a member who lands here directly (deep link, stale nav state)
 * still gets the same gate the tile itself applies before ever navigating.
 */
export default function TeamWorkloadScreen({ navigation }: Props) {
    const { colors } = useTheme();
    const { activeWorkspace } = useWorkspace();
    const workspaceId = activeWorkspace?.id;

    const [members, setMembers] = useState<WorkspaceMember[] | null>(null);
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [filter, setFilter] = useState<WorkloadFilter>("all");
    const [detailMember, setDetailMember] = useState<WorkspaceMember | null>(null);

    const load = useCallback(async () => {
        if (!workspaceId) return;
        const [data, session] = await Promise.all([getWorkspaceMembers(workspaceId), getCachedSession()]);
        setMembers(data);
        if (session?.user) setCurrentUser(session.user);
    }, [workspaceId]);

    useEffect(() => {
        load();
    }, [load]);

    const myRole = members
        ?.find((m) => m.userId === currentUser?.id || m.user.id === currentUser?.id)
        ?.workspaceRole?.toUpperCase();
    const canSeeWorkload = myRole === "OWNER" || myRole === "ADMIN" || myRole === "MANAGER";

    const sorted = useMemo(() => {
        if (!members) return [];
        return [...members].sort((a, b) => (b.openTaskCount ?? 0) - (a.openTaskCount ?? 0));
    }, [members]);

    const filtered = useMemo(() => {
        return sorted.filter((m) => {
            const count = m.openTaskCount ?? 0;
            if (filter === "zero") return count === 0;
            if (filter === "gt5") return count > 5;
            if (filter === "gt10") return count > 10;
            return true;
        });
    }, [sorted, filter]);

    const renderMember = ({ item: m }: { item: WorkspaceMember }) => {
        const count = m.openTaskCount ?? 0;
        const tint = taskCountColor(count);
        const name = getUserDisplayName(m.user);
        return (
            <PressableScale
                haptic="selection"
                style={[styles.row, { backgroundColor: colors.surfaceSolid, borderColor: colors.border }]}
                onPress={() => setDetailMember(m)}
                accessibilityLabel={`${name}, ${count} open tasks`}
            >
                <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
                    {m.user.image ? (
                        <Image source={{ uri: m.user.image }} style={styles.avatarImg} />
                    ) : (
                        <Text style={styles.avatarText}>{getUserDisplayInitial(m.user)}</Text>
                    )}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                        {name}
                    </Text>
                    {(m.designation || m.departmentName) && (
                        <Text style={[styles.subtext, { color: colors.textDim }]} numberOfLines={1}>
                            {[m.designation, m.departmentName].filter(Boolean).join(" · ")}
                        </Text>
                    )}
                </View>
                <View style={[styles.countBadge, { backgroundColor: tint + "1E", borderColor: tint + "40" }]}>
                    <Text style={[styles.countText, { color: tint }]}>{count}</Text>
                </View>
            </PressableScale>
        );
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top"]}>
            <View style={styles.header}>
                <PressableScale onPress={() => navigation.goBack()} style={styles.backBtn} accessibilityLabel="Go back">
                    <Ionicons name="chevron-back" size={24} color={colors.text} />
                </PressableScale>
                <Text style={[styles.headerTitle, { color: colors.text }]}>Team Workload</Text>
                <View style={{ width: TOUCH_TARGET.min }} />
            </View>

            <View style={styles.filterRow}>
                {FILTERS.map((f) => {
                    const active = filter === f.value;
                    return (
                        <PressableScale
                            key={f.value}
                            haptic="selection"
                            style={[
                                styles.filterChip,
                                { borderColor: colors.border },
                                active && { backgroundColor: colors.primary, borderColor: colors.primary },
                            ]}
                            onPress={() => setFilter(f.value)}
                        >
                            <Text style={[styles.filterChipText, { color: active ? "#fff" : colors.text }]}>{f.label}</Text>
                        </PressableScale>
                    );
                })}
            </View>

            {members === null ? (
                <ListSkeleton rows={8} />
            ) : !canSeeWorkload ? (
                <EmptyState
                    icon="lock-closed-outline"
                    title="Not available"
                    message="Team workload is visible to owners, admins and managers only."
                />
            ) : (
                <FlatList
                    data={filtered}
                    renderItem={renderMember}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.listContent}
                    ListEmptyComponent={
                        <EmptyState icon="people-outline" title="No members found" message="Try a different filter." />
                    }
                />
            )}

            <MemberDetailModal
                member={detailMember}
                canSeeWorkload={canSeeWorkload}
                onClose={() => setDetailMember(null)}
                onMessage={(member) => {
                    setDetailMember(null);
                    navigation.navigate("DirectChat", {
                        otherUserId: member.userId,
                        otherUserName: member.user.surname || member.user.name,
                        otherUserRole: member.workspaceRole,
                    });
                }}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    backBtn: { width: TOUCH_TARGET.min, height: TOUCH_TARGET.min, justifyContent: "center" },
    headerTitle: { fontSize: 18, fontFamily: FONTS.bold },

    filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
    filterChip: { borderWidth: 1, borderRadius: BORDER_RADIUS.full, paddingHorizontal: 12, paddingVertical: 7 },
    filterChipText: { fontSize: 12, fontFamily: FONTS.semibold },

    listContent: { padding: 16, paddingTop: 4, gap: 10 },
    row: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: BORDER_RADIUS.lg, borderWidth: 1 },
    avatar: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", overflow: "hidden" },
    avatarImg: { width: "100%", height: "100%" },
    avatarText: { color: "#fff", fontSize: 14, fontFamily: FONTS.bold },
    name: { fontSize: 15, fontFamily: FONTS.semibold },
    subtext: { fontSize: 12, marginTop: 1 },
    countBadge: { minWidth: 36, paddingHorizontal: 9, paddingVertical: 5, borderRadius: BORDER_RADIUS.full, borderWidth: 1, alignItems: "center" },
    countText: { fontSize: 14, fontFamily: FONTS.bold },
});
