"use client";

import { useMemo } from "react";
import { GanttSubtask } from "./types";
import { parseDate, calculateBarPosition, formatDate, getDaysBetween } from "./utils";
import { cn } from "@/lib/utils";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

interface SubtaskBarProps {
    subtask: GanttSubtask;
    timelineStart: Date;
    totalDays: number;
}

export function SubtaskBar({ subtask, timelineStart, totalDays }: SubtaskBarProps) {
    const { position, isValid, startDate, endDate } = useMemo(() => {
        const start = parseDate(subtask.start);
        const end = parseDate(subtask.end);

        if (!start || !end) {
            return { position: null, isValid: false, startDate: null, endDate: null };
        }

        return {
            position: calculateBarPosition(start, end, timelineStart, totalDays),
            isValid: true,
            startDate: start,
            endDate: end
        };
    }, [subtask, timelineStart, totalDays]);

    if (!isValid || !position) {
        return (
            <div className="h-6 flex items-center px-2">
                <span className="text-xs text-destructive">Invalid dates</span>
            </div>
        );
    }

    return (
        <div className="h-6 relative w-full">
            <TooltipProvider delayDuration={100}>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <div
                            className={cn(
                                "absolute top-1 h-4 rounded-md cursor-pointer",
                                "bg-blue-300 dark:bg-blue-400",
                                "hover:bg-blue-400 dark:hover:bg-blue-500",
                                "transition-all duration-200 ease-out",
                                "shadow-sm hover:shadow-md",
                                "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
                            )}
                            style={{
                                left: `${position.left}%`,
                                width: `${position.width}%`,
                                minWidth: '8px'
                            }}
                            tabIndex={0}
                            role="button"
                            aria-label={`${subtask.name}: ${formatDate(startDate!)} to ${formatDate(endDate!)}`}
                        />
                    </TooltipTrigger>
                    <TooltipContent
                        side="top"
                        className="bg-popover text-popover-foreground border shadow-lg"
                    >
                        <div className="space-y-1">
                            <p className="font-medium text-sm">{subtask.name}</p>
                            <p className="text-xs text-muted-foreground">
                                {formatDate(startDate!)} — {formatDate(endDate!)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                {getDaysBetween(startDate!, endDate!) + 1} days
                            </p>
                        </div>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        </div>
    );
}
