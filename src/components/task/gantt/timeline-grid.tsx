"use client";

import { useMemo } from "react";
import { generateTimelineColumns, getDaysBetween, getIndianDate } from "./utils";

import { cn } from "@/lib/utils";
import { GanttTask, TimelineGranularity } from "./types";

interface TimelineHeaderProps {
    startDate: Date;
    endDate: Date;
    granularity: TimelineGranularity;
}

export function TimelineHeader({ startDate, endDate, granularity }: TimelineHeaderProps) {
    const columns = useMemo(
        () => generateTimelineColumns(startDate, endDate, granularity),
        [startDate, endDate, granularity]
    );

    const monthLabels = useMemo(() => {
        if (granularity !== 'days') return [];

        const months: { label: string; span: number; startIdx: number }[] = [];
        let currentMonth = '';
        let currentSpan = 0;
        let startIdx = 0;

        columns.forEach((col, idx) => {
            const monthLabel = col.date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
            if (monthLabel !== currentMonth) {
                if (currentSpan > 0) {
                    months.push({ label: currentMonth, span: currentSpan, startIdx });
                }
                currentMonth = monthLabel;
                currentSpan = 1;
                startIdx = idx;
            } else {
                currentSpan++;
            }
        });

        if (currentSpan > 0) {
            months.push({ label: currentMonth, span: currentSpan, startIdx });
        }

        return months;
    }, [columns, granularity]);

    const columnWidth = granularity === 'days' ? 40 : granularity === 'weeks' ? 80 : 120;
    const headerHeight = granularity === 'days' ? 72 : 40;

    return (
        <div
            className="sticky top-0 z-40 bg-white dark:bg-neutral-900 min-w-full w-fit"
            style={{
                height: headerHeight,
                // @ts-ignore
                "--gantt-header-height": `${headerHeight}px`
            }}
        >
            {/* Month Row (for days view) */}
            {granularity === 'days' && (
                <div
                    className="flex border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 h-8"
                >
                    <div
                        className="sticky left-0 z-50 w-[var(--gantt-sidebar-width)] min-w-[var(--gantt-sidebar-width)] shrink-0 px-3 py-1 bg-neutral-50 dark:bg-neutral-800/50 border-r border-neutral-200 dark:border-neutral-700 h-full"
                    />
                    <div className="flex">
                        {monthLabels.map((month, idx) => (
                            <div
                                key={idx}
                                className="text-[10px] font-medium text-muted-foreground text-center border-r border-neutral-200 dark:border-neutral-700 h-full flex items-center justify-center"
                                style={{ width: month.span * columnWidth }}
                            >
                                {month.label}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Day/Week/Month Headers */}
            <div className="flex border-b border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 h-10">
                <div
                    className="sticky left-0 z-50 w-[var(--gantt-sidebar-width)] min-w-[var(--gantt-sidebar-width)] shrink-0 px-3 py-2 bg-white dark:bg-neutral-900 border-r border-neutral-200 dark:border-neutral-700 h-full flex items-center"
                >
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                        Tasks
                    </span>
                </div>
                <div className="flex">
                    {columns.map((col, idx) => (
                        <div
                            key={idx}
                            className={cn(
                                "text-[10px] text-center py-2 border-r border-neutral-200 dark:border-neutral-700 h-full flex items-center justify-center flex-col shrink-0",
                                col.isToday
                                    ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-bold"
                                    : "text-muted-foreground"
                            )}
                            style={{ width: columnWidth, minWidth: columnWidth }}
                        >
                            {col.label}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

interface TimelineGridProps {
    startDate: Date;
    endDate: Date;
    granularity: TimelineGranularity;
    tasks: GanttTask[];
    children: React.ReactNode;
}

export function TimelineGrid({ startDate, endDate, granularity, tasks, children }: TimelineGridProps) {
    const columns = useMemo(
        () => generateTimelineColumns(startDate, endDate, granularity),
        [startDate, endDate, granularity]
    );

    // Collect all subtasks from all tasks for dependency rendering
    const allSubtasks = useMemo(() => {
        return tasks.flatMap(task => task.subtasks || []);
    }, [tasks]);

    const columnWidth = granularity === 'days' ? 40 : granularity === 'weeks' ? 80 : 120;
    const totalWidth = columns.length * columnWidth;

    const todayPosition = useMemo(() => {
        const today = getIndianDate(); // Use IST for today indicator

        if (today < startDate || today > endDate) return null;

        // Find which column today falls into based on granularity
        let columnIndex = -1;

        if (granularity === 'days') {
            // For days, find the exact day column
            columnIndex = columns.findIndex(col =>
                col.date.toDateString() === today.toDateString()
            );
        } else if (granularity === 'weeks') {
            // For weeks, find which week column today falls into
            columnIndex = columns.findIndex((col, idx) => {
                const weekStart = new Date(col.date);
                const weekEnd = new Date(col.date);
                weekEnd.setDate(weekEnd.getDate() + 6);
                return today >= weekStart && today <= weekEnd;
            });
        } else {
            // For months, find which month column today falls into
            columnIndex = columns.findIndex(col =>
                col.date.getMonth() === today.getMonth() &&
                col.date.getFullYear() === today.getFullYear()
            );
        }

        if (columnIndex === -1) return null;

        // Calculate exact position within the column for more precision
        let positionWithinColumn = 0.5; // Default to middle of column

        if (granularity === 'days') {
            // For days, center in the column
            positionWithinColumn = 0.5;
        } else if (granularity === 'weeks') {
            // For weeks, calculate position within the week
            const weekStart = new Date(columns[columnIndex].date);
            const daysIntoWeek = getDaysBetween(weekStart, today);
            positionWithinColumn = (daysIntoWeek + 0.5) / 7; // +0.5 to center within the day
        } else {
            // For months, calculate position within the month
            const monthStart = new Date(columns[columnIndex].date);
            const daysIntoMonth = today.getDate() - monthStart.getDate();
            const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
            positionWithinColumn = (daysIntoMonth + 0.5) / daysInMonth;
        }

        // Return pixel position
        return columnIndex * columnWidth + (positionWithinColumn * columnWidth);
    }, [startDate, endDate, columnWidth, granularity, columns]);

    return (
        <div
            className="relative min-w-full w-fit"
            style={{
                // @ts-ignore
                "--gantt-total-width": `${totalWidth}px`
            }}
        >
            {/* Grid Background */}
            <div
                className="absolute inset-0 flex pointer-events-none"
                style={{ marginLeft: 'var(--gantt-sidebar-width)' }}
            >
                {columns.map((col, idx) => (
                    <div
                        key={idx}
                        className={cn(
                            "border-r border-neutral-100 dark:border-neutral-800",
                            col.isToday && "bg-blue-50/50 dark:bg-blue-900/10"
                        )}
                        style={{ width: columnWidth, minWidth: columnWidth }}
                    />
                ))}
            </div>

            {/* Today Indicator Line */}
            {todayPosition !== null && (
                <div
                    className="absolute top-0 bottom-0 w-0.5 bg-red-500 dark:bg-red-400 z-30 pointer-events-none"
                    style={{
                        left: `calc(var(--gantt-sidebar-width) + ${todayPosition}px)`,
                    }}
                >
                    <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-red-500 dark:bg-red-400" />
                </div>
            )}



            {/* Content Container (Vertical List of Rows) */}
            <div className="flex flex-col">
                {children}
            </div>
        </div>
    );
}
