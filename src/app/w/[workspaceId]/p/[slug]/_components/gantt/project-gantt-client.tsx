"use client";

import { GanttTask } from "../../../../../../../components/task/gantt/types";
import { useSubTaskSheet } from "@/contexts/subtask-sheet-context";
import { FlatTaskType } from "@/data/task";
import { GanttChart } from "@/components/task/gantt/gantt-chart";

interface ProjectGanttClientProps {
    workspaceId: string;
    projectId: string;
    initialTasks: GanttTask[]; // Hierarchical - already transformed server-side
    subtaskDataMap: Record<string, FlatTaskType>; // Plain object for server→client serialization
    projectCounts?: Record<string, number>;
}

export function ProjectGanttClient({ workspaceId, projectId, initialTasks, subtaskDataMap, projectCounts }: ProjectGanttClientProps) {
    // Use global subtask sheet context
    const { openSubTaskSheet } = useSubTaskSheet();

    // Handle subtask click
    const handleSubtaskClick = (subtaskId: string) => {
        const subtaskData = subtaskDataMap[subtaskId];
        if (subtaskData) {
            openSubTaskSheet(subtaskData);
        }
    };

    return (
        <div className="h-[calc(100dvh-280px)] flex flex-col">
            <div className="flex-1 overflow-hidden">
                <GanttChart
                    tasks={initialTasks}
                    workspaceId={workspaceId}
                    projectId={projectId}
                    onSubtaskClick={handleSubtaskClick}
                    projectCounts={projectCounts}
                />
            </div>
        </div>
    );
}
