"use client";

import { useMemo } from "react";
import { AlertCircle, Link, Link2 } from "lucide-react";
import { parseDate, calculateBarPosition, formatDate, getDaysBetween } from "./utils";
import { cn } from "@/lib/utils";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { GanttSubtask } from "./types";

interface SubtaskBarProps {
    subtask: GanttSubtask;
    timelineStart: Date;
    totalDays: number;
    onManageDependencies?: () => void;
}

export function SubtaskBar({ subtask, timelineStart, totalDays, onManageDependencies }: SubtaskBarProps) {
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

    const isBlocked = subtask.isBlocked || false;
    const isCompleted = subtask.status === 'COMPLETED';
    const hasDependencies = subtask.dependsOnIds && subtask.dependsOnIds.length > 0;

    if (!isValid || !position) {
        return (
            <div className="h-6 flex items-center px-2">
                <span className="text-xs text-destructive">Invalid dates</span>
            </div>
        );
    }

    return (
        <div className="h-6 relative w-full group/bar">
            <TooltipProvider delayDuration={100}>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <div
                            className={cn(
                                "absolute top-1 h-3 rounded-md cursor-pointer",
                                "transition-all duration-200 ease-out",
                                "shadow-sm hover:shadow-md",
                                "focus:outline-none focus:ring-2 focus:ring-offset-1",
                                // Status-based colors
                                isBlocked
                                    ? "bg-amber-400 dark:bg-amber-500 hover:bg-amber-500 dark:hover:bg-amber-600 focus:ring-amber-500"
                                    : (
                                        {
                                            'TO_DO': "bg-slate-400 dark:bg-slate-500 hover:bg-slate-500 dark:hover:bg-slate-600 focus:ring-slate-500",
                                            'IN_PROGRESS': "bg-blue-400 dark:bg-blue-500 hover:bg-blue-500 dark:hover:bg-blue-600 focus:ring-blue-500",
                                            'CANCELLED': "bg-red-400 dark:bg-red-500 hover:bg-red-500 dark:hover:bg-red-600 focus:ring-red-500",
                                            'REVIEW': "bg-amber-400 dark:bg-amber-500 hover:bg-amber-500 dark:hover:bg-amber-600 focus:ring-amber-500",
                                            'HOLD': "bg-purple-400 dark:bg-purple-500 hover:bg-purple-500 dark:hover:bg-purple-600 focus:ring-purple-500",
                                            'COMPLETED': "bg-green-400 dark:bg-green-500 hover:bg-green-500 dark:hover:bg-green-600 focus:ring-green-500"
                                        }[subtask.status || 'TO_DO'] || "bg-slate-400 dark:bg-slate-500 hover:bg-slate-500 dark:hover:bg-slate-600 focus:ring-slate-500"
                                    ),
                                // Striped pattern for blocked
                                isBlocked && "bg-gradient-to-r from-amber-400 via-amber-300 to-amber-400 dark:from-amber-500 dark:via-amber-400 dark:to-amber-500 bg-[length:10px_100%]"
                            )}
                            style={{
                                left: `${position.left}%`,
                                width: `${position.width}%`,
                                minWidth: '8px'
                            }}
                            tabIndex={0}
                            role="button"
                            aria-label={`${subtask.name}: ${formatDate(startDate!)} to ${formatDate(endDate!)}${isBlocked ? ' (Blocked)' : ''}`}
                        >
                            {/* Blocked indicator icon */}
                            {isBlocked && (
                                <AlertCircle className="absolute -top-1 -left-1 h-3 w-3 text-amber-700 dark:text-amber-300 bg-white dark:bg-neutral-900 rounded-full" />
                            )}
                            {/* Dependency indicator */}
                            {hasDependencies && !isBlocked && (
                                <Link className="absolute -top-1 -left-1 h-3 w-3 text-blue-600 dark:text-blue-300 bg-white dark:bg-neutral-900 rounded-full p-0.5" />
                            )}

                            {/* Dependency Management Button - Shows on hover */}
                            {onManageDependencies && (
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className={cn(
                                        "absolute -right-8 top-1/2 -translate-y-1/2 h-6 w-6 p-0",
                                        "opacity-0 group-hover/bar:opacity-100 transition-opacity",
                                        "bg-white dark:bg-neutral-800 border shadow-sm",
                                        "hover:bg-blue-50 dark:hover:bg-blue-900/20"
                                    )}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onManageDependencies();
                                    }}
                                    title="Manage dependencies"
                                >
                                    <Link2 className="h-3 w-3" />
                                </Button>
                            )}
                        </div>
                    </TooltipTrigger>
                    <TooltipContent
                        side="top"
                        className="bg-popover text-popover-foreground border shadow-lg max-w-xs"
                    >
                        <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                                <p className="font-medium text-sm">{subtask.name}</p>
                                {isBlocked && (
                                    <span className="px-1.5 py-0.5 text-xs bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 rounded">
                                        BLOCKED
                                    </span>
                                )}
                                {isCompleted && (
                                    <span className="px-1.5 py-0.5 text-xs bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded">
                                        DONE
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                {formatDate(startDate!)} — {formatDate(endDate!)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                {getDaysBetween(startDate!, endDate!) + 1} days
                            </p>
                            {/* Blocked warning */}
                            {isBlocked && subtask.blockedByNames && subtask.blockedByNames.length > 0 && (
                                <div className="pt-1 border-t border-amber-200 dark:border-amber-800">
                                    <p className="text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1">
                                        <AlertCircle className="h-3 w-3" />
                                        Waiting for:
                                    </p>
                                    <ul className="text-xs text-muted-foreground ml-4 mt-0.5">
                                        {subtask.blockedByNames.map((name: string, idx: number) => (
                                            <li key={idx}>• {name}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            {/* Dependencies info */}
                            {hasDependencies && !isBlocked && (
                                <div className="pt-1 border-t">
                                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                                        <Link className="h-3 w-3" />
                                        Dependencies: {subtask.dependsOnIds.length}
                                    </p>
                                </div>
                            )}
                        </div>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        </div>
    );
}

