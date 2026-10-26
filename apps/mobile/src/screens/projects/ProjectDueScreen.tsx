import { useState } from "react";
import { FlatList, RefreshControl, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock } from "lucide-react-native";
import { projectsApi } from "../../api/projects";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { qk } from "../../lib/query";
import { useTheme } from "../../theme/ThemeProvider";
import { EmptyState, ErrorState, ListSkeleton, Tabs } from "../../components/ui";
import { Screen, ScreenHeader } from "../../components/layout/Screen";
import { DueTaskCard, dueInRange, type DueRange } from "../../components/project/ProjectDashboard";
import type { RootStackParamList } from "../../navigation/types";

/** Every subtask due this / next week — the dashboard's "See all". */
export function ProjectDueScreen({ route }: NativeStackScreenProps<RootStackParamList, "ProjectDue">) {
    const { projectId } = route.params;
    const { colors } = useTheme();
    const { workspaceId, layout } = useWorkspace();
    const [range, setRange] = useState<DueRange>(route.params.range ?? "this");
    // Same query as the dashboard, so this opens instantly from its cache.
    const q = useQuery({ queryKey: qk.projectDashboard(workspaceId, projectId), queryFn: () => projectsApi.dashboard(workspaceId, projectId), enabled: !!workspaceId });
    const due = dueInRange(q.data, range);
    const projectName = layout?.projects.find((p) => p.id === projectId)?.name;

    return (
        <Screen>
            <ScreenHeader title="Due This Week" subtitle={projectName} showActions={false} />
            <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
                <Tabs
                    scrollable={false}
                    compact
                    value={range}
                    onChange={setRange}
                    items={[
                        { key: "this", label: "This Week" },
                        { key: "next", label: "Next Week" },
                    ]}
                />
            </View>
            {q.isError ? (
                <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />
            ) : (
                <FlatList
                    data={due}
                    keyExtractor={(t: any) => t.id}
                    contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
                    refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={colors.primaryInk} />}
                    renderItem={({ item }) => <DueTaskCard task={item} />}
                    ListEmptyComponent={
                        q.isLoading ? (
                            <ListSkeleton rows={5} avatar={false} />
                        ) : (
                            <EmptyState icon={CalendarClock} title={range === "this" ? "Nothing due this week" : "Nothing due next week"} />
                        )
                    }
                />
            )}
        </Screen>
    );
}
