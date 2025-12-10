"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { GanttTask } from "./types";
import { computeTaskDates, calculateBarPosition, formatDateRange, getDaysBetween } from "./utils";
import { SubtaskBar } from "./subtask-bar";
import { cn } from "@/lib/utils";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

interface TaskRowProps {
    task: GanttTask;
    timelineStart: Date;
    totalDays: number;
    isExpanded: boolean;
    onToggle: () => void;
}

export function TaskRow({
    task,
    timelineStart,
    totalDays,
    isExpanded,
    onToggle
}: TaskRowProps) {
    const { start, end } = useMemo(() => computeTaskDates(task), [task]);

    const position = useMemo(() => {
        if (!start || !end) return null;
        return calculateBarPosition(start, end, timelineStart, totalDays);
    }, [start, end, timelineStart, totalDays]);

    const hasSubtasks = task.subtasks && task.subtasks.length > 0;

    return (
        <>
            {/* Task Row */}
            <div className="contents group">
                {/* Left Panel - Task Name */}
                <div
                    className={cn(
                        "sticky left-0 z-10 flex items-center gap-2 px-3 py-2 min-h-[40px]",
                        "bg-white dark:bg-neutral-900",
                        "border-b border-r border-neutral-200 dark:border-neutral-700",
                        "group-hover:bg-neutral-50 dark:group-hover:bg-neutral-800/50",
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
                        "group-hover:bg-neutral-50 dark:group-hover:bg-neutral-800/50",
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
            </div>

            {/* Subtask Rows */}
            {isExpanded && hasSubtasks && (
                <>
                    {task.subtasks.map((subtask) => (
                        <div key={subtask.id} className="contents">
                            {/* Left Panel - Subtask Name */}
                            <div
                                className={cn(
                                    "sticky left-0 z-10 flex items-center gap-2 px-3 py-1.5 pl-9 min-h-[32px]",
                                    "bg-neutral-50 dark:bg-neutral-800/30",
                                    "border-b border-r border-neutral-200 dark:border-neutral-700",
                                    "hover:bg-neutral-100 dark:hover:bg-neutral-800/50",
                                    "transition-colors duration-150"
                                )}
                            >
                                <span className="text-sm text-muted-foreground truncate">
                                    {subtask.name}
                                </span>
                            </div>

                            {/* Right Panel - Subtask Bar */}
                            <div
                                className={cn(
                                    "relative min-h-[32px] flex items-center w-full",
                                    "bg-neutral-50 dark:bg-neutral-800/30",
                                    "border-b border-neutral-200 dark:border-neutral-700",
                                    "hover:bg-neutral-100 dark:hover:bg-neutral-800/50",
                                    "transition-colors duration-150"
                                )}
                            >
                                <SubtaskBar
                                    subtask={subtask}
                                    timelineStart={timelineStart}
                                    totalDays={totalDays}
                                />
                            </div>
                        </div>
                    ))}
                </>
            )}
        </>
    );
}
