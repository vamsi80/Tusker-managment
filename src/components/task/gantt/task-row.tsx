"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { computeTaskDates, calculateBarPosition, formatDateRange, getDaysBetween } from "./utils";
import { SortableSubtaskList } from "./sortable-subtask-list";
import { DependencyPicker } from "./dependency-picker";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { GanttSubtask, GanttTask } from "./types";

const SUBTASKS_PER_PAGE = 10;

interface TaskRowProps {
    task: GanttTask;
    timelineStart: Date;
    totalDays: number;
    isExpanded: boolean;
    onToggle: () => void;
    onSubtaskReorder?: (taskId: string, subtaskIds: string[]) => void;
    onSubtaskClick?: (subtaskId: string) => void;
    allTasks?: GanttTask[]; // All tasks for dependency picker
    workspaceId?: string;
    projectId?: string;
}

export function TaskRow({
    task,
    timelineStart,
    totalDays,
    isExpanded,
    onToggle,
    onSubtaskReorder,
    onSubtaskClick,
    allTasks,
    workspaceId,
    projectId
}: TaskRowProps) {
    const [dependencyPickerOpen, setDependencyPickerOpen] = useState(false);
    const [selectedSubtask, setSelectedSubtask] = useState<GanttSubtask | null>(null);
    const [visibleSubtaskCount, setVisibleSubtaskCount] = useState(SUBTASKS_PER_PAGE);
    const sentinelRef = useRef<HTMLDivElement>(null);

    const { start, end } = useMemo(() => computeTaskDates(task), [task]);

    const position = useMemo(() => {
        if (!start || !end) return null;
        return calculateBarPosition(start, end, timelineStart, totalDays);
    }, [start, end, timelineStart, totalDays]);

    const hasSubtasks = task.subtasks && task.subtasks.length > 0;

    const handleManageDependencies = (subtask: GanttSubtask) => {
        setSelectedSubtask(subtask);
        setDependencyPickerOpen(true);
    };

    // Handle load more subtasks
    const handleLoadMoreSubtasks = () => {
        setVisibleSubtaskCount(prev => Math.min(prev + SUBTASKS_PER_PAGE, task.subtasks.length));
    };

    // Get visible subtasks
    const visibleSubtasks = task.subtasks.slice(0, visibleSubtaskCount);
    const hasMoreSubtasks = visibleSubtaskCount < task.subtasks.length;

    useEffect(() => {
        const node = sentinelRef.current;
        if (!node || !hasMoreSubtasks) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    handleLoadMoreSubtasks();
                }
            },
            { threshold: 0.1, rootMargin: '100px' }
        );

        observer.observe(node);

        return () => observer.disconnect();
    }, [hasMoreSubtasks, visibleSubtaskCount]);

    return (
        <>
            {/* Task Row */}
            <>
                {/* Left Panel - Task Name */}
                <div
                    className={cn(
                        "sticky left-0 z-30 w-[200px] min-w-[200px] flex items-center gap-2 px-3 py-2 min-h-[40px]",
                        "bg-white dark:bg-neutral-900",
                        "border-b border-r border-neutral-200 dark:border-neutral-700",
                        "hover:bg-neutral-50 dark:hover:bg-neutral-800/50",
                        "transition-colors duration-150"
                    )}
                >
                    <button
                        onClick={onToggle}
                        className={cn(
                            "p-0.5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700",
                            "transition-colors duration-150",
                            !hasSubtasks && "invisible"
                        )}
                        aria-expanded={isExpanded}
                        aria-label={isExpanded ? "Collapse" : "Expand"}
                    >
                        {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                    </button>
                    <span className="font-semibold text-sm text-foreground truncate">
                        {task.name}
                    </span>
                    {hasSubtasks && (
                        <span className="text-xs text-muted-foreground ml-auto">
                            {task.subtasks.length}
                        </span>
                    )}
                </div>

                {/* Right Panel - Task Bar */}
                <div
                    className={cn(
                        "relative min-h-[40px] flex items-center w-full",
                        "border-b border-neutral-200 dark:border-neutral-700",
                        "hover:bg-neutral-50 dark:hover:bg-neutral-800/50",
                        "transition-colors duration-150"
                    )}
                >
                    {position ? (
                        <TooltipProvider delayDuration={100}>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div
                                        className={cn(
                                            "absolute h-6 rounded-md cursor-pointer",
                                            "bg-blue-600 dark:bg-blue-500",
                                            "hover:bg-blue-700 dark:hover:bg-blue-600",
                                            "transition-all duration-200 ease-out",
                                            "shadow-md hover:shadow-lg",
                                            "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
                                        )}
                                        style={{
                                            left: `${position.left}%`,
                                            width: `${position.width}%`,
                                            minWidth: '12px'
                                        }}
                                        tabIndex={0}
                                        role="button"
                                        aria-label={`${task.name}: ${formatDateRange(start, end)}`}
                                    />
                                </TooltipTrigger>
                                <TooltipContent
                                    side="top"
                                    className="bg-popover text-popover-foreground border shadow-lg"
                                >
                                    <div className="space-y-1">
                                        <p className="font-semibold text-sm">{task.name}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {formatDateRange(start, end)}
                                        </p>
                                        {start && end && (
                                            <p className="text-xs text-muted-foreground">
                                                {getDaysBetween(start, end) + 1} days • {task.subtasks.length} subtasks
                                            </p>
                                        )}
                                    </div>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    ) : (
                        <span className="text-xs text-muted-foreground px-2">
                            No subtasks
                        </span>
                    )}
                </div>
            </>

            {/* Subtask Rows - Sortable */}
            {isExpanded && hasSubtasks && (
                <>
                    <SortableSubtaskList
                        taskId={task.id}
                        subtasks={visibleSubtasks}
                        timelineStart={timelineStart}
                        totalDays={totalDays}
                        onReorder={onSubtaskReorder || (() => { })}
                        onManageDependencies={handleManageDependencies}
                        onSubtaskClick={onSubtaskClick}
                        workspaceId={workspaceId}
                        projectId={projectId}
                    />

                    {/* Load More Subtasks Button */}
                    {/* Load More Subtasks Sentinel */}
                    {hasMoreSubtasks && (
                        <>
                            {/* Left Panel - Empty space for alignment */}
                            <div className="sticky left-0 z-30 w-[200px] min-w-[200px] shrink-0 bg-neutral-50 dark:bg-neutral-800/30 border-b border-r border-neutral-200 dark:border-neutral-700" />

                            {/* Right Panel - Loading Indicator/Sentinel */}
                            <div
                                className="relative min-h-[40px] flex items-center justify-center w-full bg-neutral-50 dark:bg-neutral-800/30 border-b border-neutral-200 dark:border-neutral-700"
                            >
                                <div
                                    ref={sentinelRef}
                                    className="flex items-center gap-2 text-xs text-muted-foreground py-2"
                                >
                                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                                    Loading more subtasks...
                                </div>
                            </div>
                        </>
                    )}

                    {/* Dependency Picker Dialog */}
                    {selectedSubtask && allTasks && workspaceId && projectId && (
                        <DependencyPicker
                            open={dependencyPickerOpen}
                            onOpenChange={setDependencyPickerOpen}
                            subtask={selectedSubtask}
                            allTasks={allTasks}
                            workspaceId={workspaceId}
                            projectId={projectId}
                        />
                    )}
                </>
            )}
        </>
    );
}
