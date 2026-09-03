import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, DeviceEventEmitter, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SPACING, BORDER_RADIUS, TOUCH_TARGET, FONTS } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import { ListSkeleton } from "../../components/ScreenSkeleton";
import { haptics } from "../../services/haptics";
import { useWorkspace } from "../../context/WorkspaceContext";
import { getActivities, getCachedSession, getTaskById, getProjectDashboard, ProjectDashboardData } from "../../services/api";
import { Task } from "../../types";
import { format } from "date-fns";
import AppCard from "../../components/AppCard";
import PressableScale from "../../components/PressableScale";

interface ProjectDashboardProps {
    projectId: string;
    tasks: Task[];
    isManagerOfProject?: boolean;
    onStatPress?: (label: string) => void;
    onRefresh?: () => Promise<void>;
    navigation?: any;
}

export default function ProjectDashboard({ projectId, tasks, isManagerOfProject, onStatPress, onRefresh, navigation }: ProjectDashboardProps) {
    const { colors, isDark } = useTheme();
    const { activeWorkspace, workspaces } = useWorkspace();
    const [activities, setActivities] = useState<any[]>([]);
    const [dashboardData, setDashboardData] = useState<ProjectDashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const [currentUserId, setCurrentUserId] = useState<string | null>(null);

    useEffect(() => {
        getCachedSession().then(s => setCurrentUserId(s?.user?.id || null));
    }, []);

    const isAdminOrOwner = React.useMemo(() => {
        if (!activeWorkspace || !currentUserId) return false;
        const wsFromList = workspaces.find(w => w.id === activeWorkspace?.id);
        const role = activeWorkspace?.workspaceRole || wsFromList?.workspaceRole;
        const isOwner = (activeWorkspace?.ownerId && activeWorkspace.ownerId === currentUserId) ||
            (wsFromList?.ownerId && wsFromList.ownerId === currentUserId);
        return role === "ADMIN" || role === "OWNER" || role === "MANAGER" || isOwner;
    }, [activeWorkspace, workspaces, currentUserId]);

    const isFullView = dashboardData?.hasFullAccess ?? (isAdminOrOwner || isManagerOfProject);

    const fetchDashboardData = React.useCallback(async () => {
        if (!activeWorkspace?.id || !projectId) return;
        try {
            const data = await getProjectDashboard(activeWorkspace.id, projectId);
            if (data) {
                setDashboardData(data);
            }
        } catch (err) {
            console.error("Error fetching project dashboard data:", err);
        }
    }, [activeWorkspace?.id, projectId]);

    const handleRefresh = async () => {
        haptics.light();
        setRefreshing(true);
        try {
            await Promise.all([
                fetchActivities(),
                fetchDashboardData(),
                onRefresh ? onRefresh() : Promise.resolve()
            ]);
        } finally {
            setRefreshing(false);
        }
    };

    useEffect(() => {
        if (activeWorkspace?.id) {
            fetchActivities();
            fetchDashboardData();
        }
    }, [activeWorkspace?.id, projectId, isAdminOrOwner, fetchDashboardData]);

    const fetchActivities = React.useCallback(async () => {
        try {
            setLoading(true);
            const data = await getActivities(activeWorkspace!.id, projectId, !isAdminOrOwner);
            setActivities(data);
        } catch (e) {
            console.error("Dashboard fetchActivities error:", e);
        } finally {
            setLoading(false);
        }
    }, [activeWorkspace, projectId, isAdminOrOwner]);

    React.useEffect(() => {
        const sub = DeviceEventEmitter.addListener("remote_update", () => {
            getActivities(activeWorkspace!.id, projectId, !isAdminOrOwner)
                .then(setActivities)
                .catch(() => { });
            fetchDashboardData();
        });
        return () => sub.remove();
    }, [activeWorkspace, projectId, isAdminOrOwner, fetchDashboardData]);

    const handleActivityPress = async (act: any) => {
        if (!act.entityId) return;

        let isSubtask = act.entityType === "SUBTASK" || act.action?.includes("SUBTASK");
        let pId = projectId;

        const localTask = allVisibleTasks.find(t => t.id === act.entityId);
        if (localTask) {
            isSubtask = !!localTask.parentTaskId;
            if (localTask.projectId) pId = localTask.projectId;
        } else {
            try {
                const fullTask = await getTaskById(act.entityId);
                if (fullTask) {
                    isSubtask = !!fullTask.parentTaskId;
                    if (fullTask.projectId) pId = fullTask.projectId;
                }
            } catch (err) {
                console.log("[ProjectDashboard] Could not fetch task details for activity click:", err);
            }
        }

        if (isSubtask) {
            navigation?.navigate("SubTaskDetail", {
                subTaskId: act.entityId,
                projectId: pId
            });
        } else {
            navigation?.navigate("TaskDetail", {
                taskId: act.entityId,
                projectId: pId
            });
        }
    };

    const flattenTasks = (taskList: Task[]): Task[] => {
        let flat: Task[] = [];
        taskList.forEach(t => {
            flat.push(t);
            if (t.subTasks && t.subTasks.length > 0) {
                flat = flat.concat(flattenTasks(t.subTasks));
            }
        });
        return flat;
    };

    const allVisibleTasks = React.useMemo(() => {
        const uniqueTasks = new Map<string, Task>();
        const traverse = (list: Task[]) => {
            list.forEach(t => {
                if (!uniqueTasks.has(t.id)) {
                    uniqueTasks.set(t.id, t);
                }
                if (t.subTasks && t.subTasks.length > 0) traverse(t.subTasks);
            });
        };
        traverse(tasks || []);
        return Array.from(uniqueTasks.values());
    }, [tasks]);

    const { totalSubTasksCount, completedSubTasksCount, pendingSubTasksCount } = React.useMemo(() => {
        if (dashboardData) {
            return {
                totalSubTasksCount: dashboardData.totalCount,
                completedSubTasksCount: dashboardData.completedCount,
                pendingSubTasksCount: dashboardData.todoCount,
            };
        }

        const subTasksList = allVisibleTasks.filter(t => !!t.parentTaskId);
        const parentTasksList = allVisibleTasks.filter(t => !t.parentTaskId);

        if (subTasksList.length > 0) {
            const total = subTasksList.length;
            const completed = subTasksList.filter(t => t.status === "COMPLETED").length;
            const pending = Math.max(0, total - completed);
            return { totalSubTasksCount: total, completedSubTasksCount: completed, pendingSubTasksCount: pending };
        }

        const counts = parentTasksList.reduce((acc, t) => {
            const total = isFullView
                ? (t.subtaskCount ?? t._count?.subTasks ?? 0)
                : (t._count?.subTasks ?? t.subtaskCount ?? 0);
            const completed = t.completedSubtaskCount ?? 0;
            acc.total += total;
            acc.completed += completed;
            return acc;
        }, { total: 0, completed: 0 });

        const pending = Math.max(0, counts.total - counts.completed);
        return { totalSubTasksCount: counts.total, completedSubTasksCount: counts.completed, pendingSubTasksCount: pending };
    }, [dashboardData, allVisibleTasks, isFullView]);

    const absentMembers = React.useMemo(() => {
        if (!isFullView || !dashboardData?.allMembers) return [];
        const presentIds = new Set(dashboardData.presentRecords?.map((r: any) => r.workspaceMemberId) || []);
        return dashboardData.allMembers
            .filter((member: any) => {
                const wsRole = member.workspaceMember?.workspaceRole;
                const isOwnerOrAdmin = wsRole === "OWNER" || wsRole === "ADMIN";
                if (isOwnerOrAdmin) return false;
                const wmId = member.workspaceMember?.id;
                return !presentIds.has(wmId);
            })
            .map((member: any) => {
                const user = member.workspaceMember?.user || {};
                const name = [user.name, user.surname].filter(Boolean).join(" ") || user.surname || user.name || "Member";
                return {
                    id: member.id,
                    projectRole: member.projectRole || "MEMBER",
                    name,
                    image: user.image || null,
                    status: "ABSENT",
                };
            });
    }, [isFullView, dashboardData]);

    const stats = [
        {
            label: "Total Sub Tasks",
            value: totalSubTasksCount,
            icon: "layers" as const,
            color: colors.info
        },
        {
            label: "Completed Sub Tasks",
            value: completedSubTasksCount,
            icon: "checkmark-circle" as const,
            color: colors.success
        },
        {
            label: "Pending Sub Tasks",
            value: pendingSubTasksCount,
            icon: "time" as const,
            color: colors.warning
        },
    ];

    return (
        <ScrollView
            style={[styles.container, { backgroundColor: colors.background }]}
            contentContainerStyle={styles.content}
            refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
            }
        >
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
                {isFullView ? "Project Overview" : "My Project Overview"}
            </Text>

            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.statsScroll}
                style={styles.statsScrollWrapper}
            >
                {stats.map((stat, i) => (
                    <AppCard
                        key={i}
                        onPress={() => onStatPress?.(stat.label)}
                        elevation="sm"
                        style={styles.statCard}
                        accessibilityLabel={`${stat.label}: ${stat.value}`}
                    >
                        <View style={styles.statCardInner}>
                            <View style={[styles.iconBox, { backgroundColor: stat.color + "20" }]}>
                                <Ionicons name={stat.icon} size={20} color={stat.color} />
                            </View>
                            <View style={styles.textContainer}>
                                <Text style={[styles.statValue, { color: colors.text }]}>{stat.value}</Text>
                                <Text style={[styles.statLabel, { color: colors.textDim }]} numberOfLines={1}>
                                    {stat.label.split(" ")[0]}
                                </Text>
                            </View>
                        </View>
                    </AppCard>
                ))}
            </ScrollView>

            {isFullView && (
                <View style={styles.absentSection}>
                    <View style={styles.sectionHeaderRow}>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.sectionTitleWithoutPadding, { color: colors.text }]}>
                                Absent / On Leave Today
                            </Text>
                            <Text style={[styles.sectionSubtitle, { color: colors.textDim }]}>
                                Not in the office today
                            </Text>
                        </View>
                        <View style={[styles.absentCountBadge, { backgroundColor: colors.error + "18" }]}>
                            <Text style={[styles.absentCountText, { color: colors.error }]}>
                                {absentMembers.length} {absentMembers.length === 1 ? "Member" : "Members"}
                            </Text>
                        </View>
                    </View>

                    {absentMembers.length === 0 ? (
                        <View style={[styles.emptyAbsentCard, { backgroundColor: colors.surfaceSolid, borderColor: colors.border }]}>
                            <Ionicons name="checkmark-circle-outline" size={24} color={colors.success} style={{ marginBottom: 4 }} />
                            <Text style={[styles.emptyAbsentText, { color: colors.textDim }]}>
                                All members are present today
                            </Text>
                        </View>
                    ) : (
                        <View style={styles.absentList}>
                            {absentMembers.map((member) => (
                                <View
                                    key={member.id}
                                    style={[styles.absentItem, { backgroundColor: colors.surfaceSolid, borderColor: colors.border }]}
                                >
                                    <View style={styles.absentMemberInfo}>
                                        {member.image ? (
                                            <Image source={{ uri: member.image }} style={styles.memberAvatar} />
                                        ) : (
                                            <View style={[styles.memberAvatarFallback, { backgroundColor: colors.primary + "18" }]}>
                                                <Text style={[styles.memberAvatarText, { color: colors.primary }]}>
                                                    {(member.name?.[0] || "?").toUpperCase()}
                                                </Text>
                                            </View>
                                        )}
                                        <View style={styles.memberTextContainer}>
                                            <Text style={[styles.memberName, { color: colors.text }]} numberOfLines={1}>
                                                {member.name}
                                            </Text>
                                            <Text style={[styles.memberRole, { color: colors.textDim }]}>
                                                {member.projectRole.toLowerCase().replace(/_/g, " ")}
                                            </Text>
                                        </View>
                                    </View>
                                    <View style={[styles.absentBadge, { backgroundColor: colors.error + "18" }]}>
                                        <Text style={[styles.absentBadgeText, { color: colors.error }]}>
                                            Absent
                                        </Text>
                                    </View>
                                </View>
                            ))}
                        </View>
                    )}
                </View>
            )}

            <Text style={[styles.sectionTitle, { color: colors.text, marginTop: SPACING.md }]}>Recent Activity</Text>

            {loading ? (
                <ListSkeleton rows={4} />
            ) : activities.length === 0 ? (
                <View style={[styles.activityCard, { backgroundColor: colors.surfaceSolid, borderColor: colors.border, justifyContent: "center", borderStyle: "dashed" }]}>
                    <Text style={[styles.activityText, { color: colors.textDim, textAlign: "center" }]}>
                        {isFullView ? "No workspace activity found." : "No recent activity found for your tasks."}
                    </Text>
                </View>
            ) : (
                <>
                    <View style={styles.activityList}>
                        {activities.slice(0, 5).map((act) => (
                            <AppCard
                                key={act.id}
                                onPress={() => handleActivityPress(act)}
                                elevation="none"
                                padded={false}
                                style={styles.activityItem}
                                accessibilityLabel={act.text}
                            >
                                <View style={[styles.activityIconBox, { backgroundColor: colors.primary + "10" }]}>
                                    <Ionicons name="chatbubble-outline" size={16} color={colors.primary} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                                        <Text style={[styles.activityText, { color: colors.text, flex: 1 }]} numberOfLines={2}>
                                            {act.text}
                                        </Text>
                                        <Text style={[styles.activityTime, { color: colors.textDim, marginLeft: 8, marginTop: 2 }]}>
                                            {format(new Date(act.createdAt), 'MMM d, h:mm a')}
                                        </Text>
                                    </View>
                                </View>
                            </AppCard>
                        ))}
                    </View>
                    {activities.length > 5 && (
                        <PressableScale
                            style={styles.viewAllBtn}
                            haptic="selection"
                            onPress={() => navigation?.navigate("ProjectActivity", { projectId, projectName: tasks[0]?.project?.name || "Project" })}
                            accessibilityRole="button"
                            accessibilityLabel="View all activity"
                        >
                            <Text style={{ color: colors.primary, fontFamily: FONTS.semibold, fontSize: 14 }}>
                                View All Activity
                            </Text>
                        </PressableScale>
                    )}
                </>
            )}
            <View style={{ height: SPACING.bottomTabBar }} />
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    content: { paddingVertical: 0 },
    sectionTitle: { fontSize: 18, fontFamily: FONTS.extrabold, marginBottom: SPACING.sm, marginTop: SPACING.md, paddingHorizontal: SPACING.lg },
    sectionTitleWithoutPadding: { fontSize: 18, fontFamily: FONTS.extrabold },
    sectionSubtitle: { fontSize: 12, fontFamily: FONTS.regular, marginTop: 2 },

    statsScrollWrapper: { marginVertical: 0 },
    statsScroll: { paddingHorizontal: SPACING.lg, gap: SPACING.md, paddingBottom: SPACING.sm },
    statCard: {
        width: 150,
    },
    statCardInner: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
    },
    iconBox: { width: 40, height: 40, borderRadius: 12, justifyContent: "center", alignItems: "center" },
    textContainer: { flex: 1, justifyContent: "center" },
    statValue: { fontSize: 20, fontFamily: FONTS.extrabold, lineHeight: 22 },
    statLabel: { fontSize: 11, fontFamily: FONTS.semibold, marginTop: 0, opacity: 0.8 },

    absentSection: {
        paddingHorizontal: SPACING.lg,
        marginTop: SPACING.md,
    },
    sectionHeaderRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: SPACING.sm,
    },
    absentCountBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: BORDER_RADIUS.full,
    },
    absentCountText: {
        fontSize: 12,
        fontFamily: FONTS.bold,
    },
    emptyAbsentCard: {
        padding: SPACING.lg,
        borderRadius: BORDER_RADIUS.lg,
        borderWidth: 1,
        alignItems: "center",
        justifyContent: "center",
    },
    emptyAbsentText: {
        fontSize: 13,
        fontFamily: FONTS.medium,
        fontStyle: "italic",
    },
    absentList: {
        gap: SPACING.sm,
    },
    absentItem: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        padding: 12,
        borderRadius: BORDER_RADIUS.lg,
        borderWidth: 1,
    },
    absentMemberInfo: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        flex: 1,
    },
    memberAvatar: {
        width: 38,
        height: 38,
        borderRadius: 19,
    },
    memberAvatarFallback: {
        width: 38,
        height: 38,
        borderRadius: 19,
        justifyContent: "center",
        alignItems: "center",
    },
    memberAvatarText: {
        fontSize: 15,
        fontFamily: FONTS.bold,
    },
    memberTextContainer: {
        flex: 1,
    },
    memberName: {
        fontSize: 14,
        fontFamily: FONTS.bold,
    },
    memberRole: {
        fontSize: 12,
        fontFamily: FONTS.regular,
        textTransform: "capitalize",
        marginTop: 1,
    },
    absentBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: BORDER_RADIUS.full,
    },
    absentBadgeText: {
        fontSize: 11,
        fontFamily: FONTS.bold,
    },

    activityCard: { marginHorizontal: SPACING.lg, flexDirection: "row", alignItems: "center", padding: SPACING.lg, borderRadius: BORDER_RADIUS.lg, borderWidth: 1, gap: SPACING.md },
    activityList: { paddingHorizontal: SPACING.lg, gap: SPACING.sm },
    activityItem: {
        flexDirection: "row",
        alignItems: "center",
        padding: 10,
        gap: 12,
    },
    viewAllBtn: {
        padding: SPACING.md,
        alignItems: "center",
        justifyContent: "center",
        marginTop: SPACING.sm,
        minHeight: TOUCH_TARGET.min,
    },
    activityIconBox: { width: 32, height: 32, borderRadius: 16, justifyContent: "center", alignItems: "center" },
    activityAuthor: { fontSize: 13, fontFamily: FONTS.bold },
    activityTime: { fontSize: 10, opacity: 0.7 },
    activityText: { fontSize: 13, lineHeight: 18 },
    activityTaskName: { fontSize: 10, fontFamily: FONTS.semibold, opacity: 0.8 },
});
