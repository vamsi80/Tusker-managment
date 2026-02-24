"use client";

import { useMemo, useRef, useEffect } from "react";
import { ChevronDown, ChevronRight, Folder } from "lucide-react";
import { calculateBarPosition, formatDateRange, getDaysBetween } from "./utils";
import { cn } from "@/lib/utils";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { GanttTask } from "./types";

interface ProjectRowProps {
    id: string;
    name: string;
    tasks: GanttTask[];
    timelineStart: Date;
    totalDays: number;
    isExpanded: boolean;
    onToggle: () => void;
    children?: React.ReactNode;
    color?: string;
    hasMore?: boolean;
    onLoadMore?: () => void;
    totalTasksCount?: number;
}

export function ProjectRow({
    id,
    name,
    tasks,
    timelineStart,
    totalDays,
    isExpanded,
    onToggle,
    children,
    color = "#666",
    hasMore,
    onLoadMore,
    totalTasksCount
}: ProjectRowProps) {
    const { start, end } = useMemo(() => {
        let minStart: Date | null = null;
        let maxEnd: Date | null = null;

        tasks.forEach(task => {
            if (task.subtasks) {
                task.subtasks.forEach(subtask => {
                    if (subtask.start) {
                        const s = new Date(subtask.start);
                        if (!minStart || s < minStart) minStart = s;
                    }
                    if (subtask.end) {
                        const e = new Date(subtask.end);
                        if (!maxEnd || e > maxEnd) maxEnd = e;
                    }
                });
            }
        });

        // Also check if tasks themselves have implied dates if needed, 
        // but typically currently derived from subtasks.
        // If no subtasks, check if we have any other date source? 
        // Currently transforms logic computes dates.

        return { start: minStart, end: maxEnd };
    }, [tasks]);

    const position = useMemo(() => {
        if (!start || !end) return null;
        return calculateBarPosition(start, end, timelineStart, totalDays);
    }, [start, end, timelineStart, totalDays]);

    // Auto-scroll trigger for project tasks
    const loaderRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!loaderRef.current || !onLoadMore) return;
        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting && hasMore) {
                onLoadMore();
            }
        }, { threshold: 0.1 });
        observer.observe(loaderRef.current);
        return () => observer.disconnect();
    }, [hasMore, onLoadMore]);

    return (
        <>
            {/* Project Row */}
            <>
                {/* Left Panel - Project Name */}
                <div
                    className={cn(
                        "sticky left-0 z-30 w-[var(--gantt-sidebar-width)] min-w-[var(--gantt-sidebar-width)] flex items-center gap-1 px-3 py-2 min-h-[32px]",
                        "bg-neutral-100 dark:bg-neutral-800",
                        "border-b border-r border-neutral-200 dark:border-neutral-700",
                        "hover:bg-neutral-200 dark:hover:bg-neutral-700/50",
                        "transition-colors duration-150"
                    )}
                >
                    <button
                        onClick={onToggle}
                        className={cn(
                            "p-0.5 rounded hover:bg-neutral-300 dark:hover:bg-neutral-600",
                            "transition-colors duration-150"
                        )}
                        aria-expanded={isExpanded}
                        aria-label={isExpanded ? "Collapse Project" : "Expand Project"}
                    >
                        {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                    </button>
                    <Folder
                        className="h-4 w-4 shrink-0 transition-colors"
                        style={{ color: color || 'currentColor' }}
                    />
                    <span className="font-semibold text-sm text-foreground truncate" title={name}>
                        {name}
                    </span>
                    <span className="text-xs text-muted-foreground ml-auto">
                        {totalTasksCount ?? tasks.length}
                    </span>
                </div>

                {/* Right Panel - Project Bar */}
                <div
                    className={cn(
                        "relative min-h-[32px] flex items-center w-full",
                        "bg-neutral-50/50 dark:bg-neutral-900/50", // Slight background diff
                        "border-b border-neutral-200 dark:border-neutral-700"
                    )}
                >
                    {position && (
                        <TooltipProvider delayDuration={100}>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div
                                        className={cn(
                                            "absolute h-4 rounded-full opacity-80",
                                            "hover:opacity-100",
                                            "transition-all duration-200"
                                        )}
                                        style={{
                                            left: `${position.left}%`,
                                            width: `${position.width}%`,
                                            backgroundColor: color || '#888',
                                            minWidth: '12px',
                                            top: '8px'
                                        }}
                                    />
                                </TooltipTrigger>
                                <TooltipContent
                                    side="top"
                                    className="bg-popover text-popover-foreground border shadow-lg"
                                >
                                    <div className="space-y-1">
                                        <p className="font-semibold text-sm">{name}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {formatDateRange(start, end)}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {totalTasksCount ?? tasks.length} tasks
                                        </p>
                                    </div>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    )}
                </div>
            </>

            {/* Task Rows */}
            {isExpanded && children}

            {/* Load More Tasks in Project */}
            {isExpanded && hasMore && (
                <>
                    {/* Left Panel */}
                    <div ref={loaderRef} className="sticky left-0 z-30 w-[var(--gantt-sidebar-width)] min-w-[var(--gantt-sidebar-width)] shrink-0 bg-neutral-50 dark:bg-neutral-800/30 border-b border-r border-neutral-200 dark:border-neutral-700 flex items-center px-3 py-1.5 pl-8">
                        <span className="text-xs text-muted-foreground">Loading more...</span>
                    </div>
                    {/* Right Panel */}
                    <div className="relative min-h-[32px] w-full bg-neutral-50/50 dark:bg-neutral-800/10 border-b border-neutral-200 dark:border-neutral-700" />
                </>
            )}
        </>
    );
}
