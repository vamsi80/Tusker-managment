"use client";

import { useState, useMemo } from "react";
import { Calendar, ChevronDown } from "lucide-react";
import { GanttTask, TimelineGranularity } from "./types";
import { calculateTimelineRange, getDaysBetween } from "./utils";
import { TimelineHeader, TimelineGrid } from "./timeline-grid";
import { TaskRow } from "./task-row";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface GanttChartProps {
    tasks: GanttTask[];
    className?: string;
}

export function GanttChart({ tasks, className }: GanttChartProps) {
    const [granularity, setGranularity] = useState<TimelineGranularity>('days');
    const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());

    const timelineRange = useMemo(() => calculateTimelineRange(tasks), [tasks]);
    const totalDays = useMemo(
        () => getDaysBetween(timelineRange.start, timelineRange.end),
        [timelineRange]
    );

    const toggleTask = (taskId: string) => {
        setExpandedTasks((prev) => {
            const next = new Set(prev);
            if (next.has(taskId)) {
                next.delete(taskId);
            } else {
                next.add(taskId);
            }
            return next;
        });
    };

    const expandAll = () => {
        setExpandedTasks(new Set(tasks.map((t) => t.id)));
    };

    const collapseAll = () => {
        setExpandedTasks(new Set());
    };

    if (tasks.length === 0) {
        return (
            <div className={cn("flex flex-col items-center justify-center h-96 border-2 border-dashed rounded-lg", className)}>
                <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold text-foreground">No Tasks</h3>
                <p className="text-sm text-muted-foreground">
                    Create tasks to see them on the timeline
                </p>
            </div>
        );
    }

    return (
        <div className={cn("flex flex-col h-full", className)}>
            {/* Toolbar */}
            <div className="flex items-center justify-between gap-4 mb-4 px-1">
                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={expandAll}
                        className="text-xs"
                    >
                        Expand All
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={collapseAll}
                        className="text-xs"
                    >
                        Collapse All
                    </Button>
                </div>

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-2">
                            <Calendar className="h-4 w-4" />
                            {granularity === 'days' ? 'Days' : granularity === 'weeks' ? 'Weeks' : 'Months'}
                            <ChevronDown className="h-3 w-3" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setGranularity('days')}>
                            Days
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setGranularity('weeks')}>
                            Weeks
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setGranularity('months')}>
                            Months
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {/* Gantt Container */}
            <div
                className={cn(
                    "flex-1 overflow-auto rounded-lg border border-neutral-200 dark:border-neutral-700",
                    "bg-white dark:bg-neutral-900",
                    "shadow-sm",
                    "[&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar]:w-2",
                    "[&::-webkit-scrollbar-track]:bg-transparent",
                    "[&::-webkit-scrollbar-thumb]:bg-neutral-300 dark::[&::-webkit-scrollbar-thumb]:bg-neutral-600",
                    "[&::-webkit-scrollbar-thumb]:rounded-full"
                )}
            >
                {/* Timeline Header */}
                <TimelineHeader
                    startDate={timelineRange.start}
                    endDate={timelineRange.end}
                    granularity={granularity}
                />

                {/* Timeline Grid with Tasks */}
                <TimelineGrid
                    startDate={timelineRange.start}
                    endDate={timelineRange.end}
                    granularity={granularity}
                >
                    {tasks.map((task) => (
                        <TaskRow
                            key={task.id}
                            task={task}
                            timelineStart={timelineRange.start}
                            totalDays={totalDays}
                            isExpanded={expandedTasks.has(task.id)}
                            onToggle={() => toggleTask(task.id)}
                        />
                    ))}
                </TimelineGrid>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-6 mt-4 px-1 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                    <div className="w-4 h-3 rounded bg-blue-600 dark:bg-blue-500" />
                    <span>Task</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-4 h-2 rounded bg-blue-300 dark:bg-blue-400" />
                    <span>Subtask</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-0.5 h-4 bg-red-500 dark:bg-red-400" />
                    <span>Today</span>
                </div>
            </div>
        </div>
    );
}
