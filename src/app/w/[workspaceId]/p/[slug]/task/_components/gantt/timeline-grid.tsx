"use client";

import { useMemo } from "react";
import { TimelineGranularity } from "./types";
import { generateTimelineColumns, getDaysBetween, getIndianDate } from "./utils";
import { cn } from "@/lib/utils";

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

    return (
        <div className="sticky top-0 z-20">
            {/* Month Row (for days view) */}
            {granularity === 'days' && (
                <div
                    className="flex border-b border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800"
                >
                    <div
                        className="sticky left-0 z-30 w-[200px] min-w-[200px] shrink-0 px-3 py-1 bg-neutral-100 dark:bg-neutral-800 border-r border-neutral-200 dark:border-neutral-700"
                    />
                    <div className="flex">
                        {monthLabels.map((month, idx) => (
                            <div
                                key={idx}
                                className="text-xs font-medium text-muted-foreground text-center border-r border-neutral-200 dark:border-neutral-700"
                                style={{ width: month.span * columnWidth }}
                            >
                                {month.label}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Day/Week/Month Headers */}
            <div className="flex border-b border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900">
                <div
                    className="sticky left-0 z-30 w-[200px] min-w-[200px] shrink-0 px-3 py-2 bg-white dark:bg-neutral-900 border-r border-neutral-200 dark:border-neutral-700"
                >
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Tasks
                    </span>
                </div>
                <div className="flex">
                    {columns.map((col, idx) => (
                        <div
                            key={idx}
                            className={cn(
                                "text-xs text-center py-2 border-r border-neutral-200 dark:border-neutral-700",
                                col.isToday
                                    ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-semibold"
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
    children: React.ReactNode;
}

export function TimelineGrid({ startDate, endDate, granularity, children }: TimelineGridProps) {
    const columns = useMemo(
        () => generateTimelineColumns(startDate, endDate, granularity),
        [startDate, endDate, granularity]
    );

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
        <div className="relative">
            {/* Grid Background */}
            <div
                className="absolute inset-0 flex pointer-events-none"
                style={{ marginLeft: 200 }}
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
                        left: `calc(200px + ${todayPosition}px)`,
                    }}
                >
                    <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-red-500 dark:bg-red-400" />
                </div>
            )}

            {/* Content Grid */}
            <div
                className="grid"
                style={{
                    gridTemplateColumns: `200px ${totalWidth}px`,
                }}
            >
                {children}
            </div>
        </div>
    );
}
