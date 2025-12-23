"use client";

import { GanttChart } from "@/components/task/gantt/gantt-chart";
import { GanttTask } from "@/components/task/gantt/types";

interface WorkspaceGanttClientProps {
    workspaceId: string;
    initialTasks: GanttTask[];
    subtaskDataMap: Map<string, any>;
}

export function WorkspaceGanttClient({
    workspaceId,
    initialTasks,
    subtaskDataMap,
}: WorkspaceGanttClientProps) {
    return (
        <GanttChart
            workspaceId={workspaceId}
            tasks={initialTasks}
        />
    );
}
