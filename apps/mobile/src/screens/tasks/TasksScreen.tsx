import { useEffect, useMemo, useState } from "react";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { Screen, ScreenHeader } from "../../components/layout/Screen";
import { TaskViews, type TaskView } from "../../components/task/TaskViews";
import type { RootStackParamList } from "../../navigation/types";

/** /w/[workspaceId]/tasks?view=list|kanban|gantt — every task the caller can see. */
export function TasksScreen({ route }: NativeStackScreenProps<RootStackParamList, "Tasks">) {
    const { permissions, isAdmin } = useWorkspace();
    const [view, setView] = useState<TaskView>(route.params?.view ?? "list");
    useEffect(() => {
        if (route.params?.view) setView(route.params.view);
    }, [route.params?.view]);
    // Opened from Workload: one member's open subtasks.
    const { assigneeId, assigneeName, status } = route.params ?? {};
    const filterPreset = useMemo(
        () => (assigneeId ? { filters: { assigneeId: [assigneeId], status: status ?? [] }, at: Date.now() } : undefined),
        [assigneeId, status],
    );

    return (
        <Screen>
            <ScreenHeader title={assigneeName ? `${assigneeName}'s tasks` : "Tasks"} subtitle={assigneeName ? "Open subtasks" : undefined} />
            <TaskViews
                view={view}
                onViewChange={setView}
                canCreateTask={isAdmin}
                canCreateSubtask={!!permissions?.hasAccess || isAdmin}
                filterPreset={filterPreset}
            />
        </Screen>
    );
}
