"use client";

import { useState } from "react";
import { GanttTask } from "../../../../../../../components/task/gantt/types";
import { useSubTaskSheet } from "@/contexts/subtask-sheet-context";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import { FlatTaskType } from "@/data/task";
import { GanttChart } from "@/components/task/gantt/gantt-chart";

interface ProjectGanttClientProps {
    workspaceId: string;
    projectId: string;
    initialTasks: GanttTask[];
    subtaskDataMap: Map<string, FlatTaskType>;
}

const TASKS_PER_PAGE = 10;

export function ProjectGanttClient({ workspaceId, projectId, initialTasks, subtaskDataMap }: ProjectGanttClientProps) {
    const [visibleTaskCount, setVisibleTaskCount] = useState(TASKS_PER_PAGE);

    // Use global subtask sheet context
    const { openSubTaskSheet } = useSubTaskSheet();

    // Handle subtask click
    const handleSubtaskClick = (subtaskId: string) => {
        const subtaskData = subtaskDataMap.get(subtaskId);
        if (subtaskData) {
            openSubTaskSheet(subtaskData);
        }
    };

    // Load more tasks
    const handleLoadMoreTasks = () => {
        setVisibleTaskCount(prev => Math.min(prev + TASKS_PER_PAGE, initialTasks.length));
    };

    // Get visible tasks
    const visibleTasks = initialTasks.slice(0, visibleTaskCount);
    const hasMoreTasks = visibleTaskCount < initialTasks.length;

    return (
        <>
            <div className="h-[calc(100vh-280px)] flex flex-col">
                <div className="flex-1 overflow-hidden">
                    <GanttChart
                        tasks={visibleTasks}
                        workspaceId={workspaceId}
                        projectId={projectId}
                        onSubtaskClick={handleSubtaskClick}
                    />
                </div>

                {/* Load More Tasks Button */}
                {hasMoreTasks && (
                    <div className="flex justify-center py-4 border-t border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleLoadMoreTasks}
                            className="gap-2"
                        >
                            <ChevronDown className="h-4 w-4" />
                            Load More Tasks ({initialTasks.length - visibleTaskCount} remaining)
                        </Button>
                    </div>
                )}
            </div>
        </>
    );
}
