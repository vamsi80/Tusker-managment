"use client";

import { useState } from "react";
import { GanttChart } from "./gantt-chart";
import { GanttTask } from "./types";
import { SubTaskDetailsSheet } from "../shared/subtask-details-sheet";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import { SubTaskType } from "@/app/data/task/get-project-tasks";

interface GanttContainerProps {
    workspaceId: string;
    projectId: string;
    initialTasks: GanttTask[];
    subtaskDataMap: Map<string, SubTaskType[number]>;
}

const TASKS_PER_PAGE = 10;

export function GanttContainer({ workspaceId, projectId, initialTasks, subtaskDataMap }: GanttContainerProps) {
    const [visibleTaskCount, setVisibleTaskCount] = useState(TASKS_PER_PAGE);
    const [selectedSubtaskId, setSelectedSubtaskId] = useState<string | null>(null);
    const [isSheetOpen, setIsSheetOpen] = useState(false);

    // Handle subtask click
    const handleSubtaskClick = (subtaskId: string) => {
        setSelectedSubtaskId(subtaskId);
        setIsSheetOpen(true);
    };

    // Handle sheet close
    const handleSheetClose = () => {
        setIsSheetOpen(false);
        setSelectedSubtaskId(null);
    };

    // Load more tasks
    const handleLoadMoreTasks = () => {
        setVisibleTaskCount(prev => Math.min(prev + TASKS_PER_PAGE, initialTasks.length));
    };

    // Get visible tasks
    const visibleTasks = initialTasks.slice(0, visibleTaskCount);
    const hasMoreTasks = visibleTaskCount < initialTasks.length;

    // Get the full subtask data from the map
    const selectedSubtask = selectedSubtaskId ? subtaskDataMap.get(selectedSubtaskId) : null;

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

            {/* Subtask Details Sheet */}
            <SubTaskDetailsSheet
                subTask={selectedSubtask || null}
                isOpen={isSheetOpen}
                onClose={handleSheetClose}
            />
        </>
    );
}
