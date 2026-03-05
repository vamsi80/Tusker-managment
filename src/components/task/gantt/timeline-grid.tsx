"use client";

import { useMemo } from "react";
import { generateTimelineColumns, getDaysBetween, getIndianDate } from "./utils";

import { cn } from "@/lib/utils";
import { GanttTask, TimelineGranularity } from "./types";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ChevronsDownUp, ChevronsUpDown, Download, Calendar, ChevronDown } from "lucide-react";

interface TimelineHeaderProps {
    startDate: Date;
    endDate: Date;
    granularity: TimelineGranularity;
    tasks: GanttTask[];
    expandedTasks: Set<string>;
    expandedProjects: Set<string>;
    groupByProject: boolean;
    onExpandAll: () => void;
    onCollapseAll: () => void;
    onExport: () => void;
    onGranularityChange: (g: TimelineGranularity) => void;
    scrollX: number;
    viewportWidth: number;
}

export function TimelineHeader({
    startDate,
    endDate,
    granularity,
    tasks,
    expandedTasks,
    expandedProjects,
    groupByProject,
    onExpandAll,
    onCollapseAll,
    onExport,
    onGranularityChange,
    scrollX,
    viewportWidth
}: TimelineHeaderProps) {
    const columns = useMemo(
        () => generateTimelineColumns(startDate, endDate, granularity),
        [startDate, endDate, granularity]
    );

    const columnWidth = granularity === 'days' ? 40 : granularity === 'weeks' ? 80 : 120;
    const headerHeight = granularity === 'days' ? 72 : 40;

    // 🚀 Horizontal Virtualization: Determine visible indices
    const sidebarWidth = 200; // Match sidebar width
    const visibleStartIndex = Math.max(0, Math.floor((scrollX - sidebarWidth) / columnWidth));
    const visibleEndIndex = Math.min(columns.length, Math.ceil((scrollX + viewportWidth) / columnWidth));

    const visibleColumns = useMemo(() => {
        return columns.slice(visibleStartIndex, visibleEndIndex);
    }, [columns, visibleStartIndex, visibleEndIndex]);

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

        // Clip month labels to what's visible
        return months.filter(m => (m.startIdx + m.span) >= visibleStartIndex && m.startIdx <= visibleEndIndex);
    }, [columns, granularity, visibleStartIndex, visibleEndIndex]);

    const allExpanded = tasks.length > 0 && tasks.every(t => expandedTasks.has(t.id));

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
                    <div className="flex relative items-stretch">
                        {/* Leading Spacer to nudge columns to correct absolute position */}
                        <div style={{ width: visibleStartIndex * columnWidth }} />
                        {monthLabels.map((month, idx) => (
                            <div
                                key={idx}
                                className="text-[10px] font-medium text-muted-foreground text-center border-r border-neutral-200 dark:border-neutral-700 h-full flex items-center justify-center truncate px-1"
                                style={{
                                    // Adjust width for clipped months at start/end
                                    width: (Math.min(month.startIdx + month.span, visibleEndIndex) - Math.max(month.startIdx, visibleStartIndex)) * columnWidth
                                }}
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
                    className="sticky left-0 z-50 w-[var(--gantt-sidebar-width)] min-w-[var(--gantt-sidebar-width)] shrink-0 px-3 py-2 bg-white dark:bg-neutral-900 border-r border-neutral-200 dark:border-neutral-700 h-[100%] flex flex-col justify-between shadow-sm"
                >
                    <div className="flex items-center justify-between w-full h-full">
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                            Tasks
                        </span>

                        <div className="flex items-center gap-1">
                            {/* Expand / Collapse toggle */}
                            <TooltipProvider delayDuration={200}>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={allExpanded ? onCollapseAll : onExpandAll}
                                            className="h-6 w-6 p-0"
                                        >
                                            {allExpanded
                                                ? <ChevronsDownUp className="h-3.5 w-3.5" />
                                                : <ChevronsUpDown className="h-3.5 w-3.5" />
                                            }
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="bottom">
                                        {allExpanded ? 'Collapse All' : 'Expand All'}
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>

                            {/* Export */}
                            <TooltipProvider delayDuration={200}>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={onExport}
                                            className="h-6 w-6 p-0"
                                        >
                                            <Download className="h-3.5 w-3.5" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="bottom">Export to Sheets</TooltipContent>
                                </Tooltip>
                            </TooltipProvider>

                            {/* Granularity picker */}
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                                        <Calendar className="h-3.5 w-3.5" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => onGranularityChange('days')}>
                                        Days
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => onGranularityChange('weeks')}>
                                        Weeks
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => onGranularityChange('months')}>
                                        Months
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>
                </div>
                <div className="flex relative">
                    {/* Leading Spacer */}
                    <div style={{ width: visibleStartIndex * columnWidth }} />
                    {visibleColumns.map((col, idx) => (
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
                    {/* Trailing Spacer to keep total width correct for horizontal scrollbar */}
                    <div style={{ width: (columns.length - visibleEndIndex) * columnWidth }} />
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
    scrollX: number;
    viewportWidth: number;
}

export function TimelineGrid({ startDate, endDate, granularity, tasks, children, scrollX, viewportWidth }: TimelineGridProps) {
    const columns = useMemo(
        () => generateTimelineColumns(startDate, endDate, granularity),
        [startDate, endDate, granularity]
    );

    const columnWidth = granularity === 'days' ? 40 : granularity === 'weeks' ? 80 : 120;
    const totalWidth = columns.length * columnWidth;

    // 🚀 Horizontal Virtualization
    const sidebarWidth = 200;
    const visibleStartIndex = Math.max(0, Math.floor((scrollX - sidebarWidth) / columnWidth));
    const visibleEndIndex = Math.min(columns.length, Math.ceil((scrollX + viewportWidth) / columnWidth));

    const visibleColumns = useMemo(() => {
        return columns.slice(visibleStartIndex, visibleEndIndex);
    }, [columns, visibleStartIndex, visibleEndIndex]);

    const todayPosition = useMemo(() => {
        const today = getIndianDate(); // Use IST for today indicator

        if (today < startDate || today > endDate) return null;

        // Find which column today falls into based on granularity
        let columnIndex = -1;

        if (granularity === 'days') {
            columnIndex = columns.findIndex(col =>
                col.date.toDateString() === today.toDateString()
            );
        } else if (granularity === 'weeks') {
            columnIndex = columns.findIndex((col, idx) => {
                const weekStart = new Date(col.date);
                const weekEnd = new Date(col.date);
                weekEnd.setDate(weekEnd.getDate() + 6);
                return today >= weekStart && today <= weekEnd;
            });
        } else {
            columnIndex = columns.findIndex(col =>
                col.date.getMonth() === today.getMonth() &&
                col.date.getFullYear() === today.getFullYear()
            );
        }

        if (columnIndex === -1) return null;

        let positionWithinColumn = 0.5;

        if (granularity === 'weeks') {
            const weekStart = new Date(columns[columnIndex].date);
            const daysIntoWeek = getDaysBetween(weekStart, today);
            positionWithinColumn = (daysIntoWeek + 0.5) / 7;
        } else if (granularity === 'months') {
            const monthStart = new Date(columns[columnIndex].date);
            const daysIntoMonth = today.getDate() - monthStart.getDate();
            const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
            positionWithinColumn = (daysIntoMonth + 0.5) / daysInMonth;
        }

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
                className="absolute inset-x-0 inset-y-0 flex pointer-events-none"
                style={{ marginLeft: 'var(--gantt-sidebar-width)' }}
            >
                {/* Horizontal virtual spacer */}
                <div style={{ width: visibleStartIndex * columnWidth }} className="shrink-0" />

                {visibleColumns.map((col, idx) => (
                    <div
                        key={idx}
                        className={cn(
                            "border-r border-neutral-100 dark:border-neutral-800 shrink-0",
                            col.isToday && "bg-blue-50/30 dark:bg-blue-900/10"
                        )}
                        style={{ width: columnWidth, minWidth: columnWidth }}
                    />
                ))}

                {/* Trailing virtual spacer */}
                <div style={{ width: (columns.length - visibleEndIndex) * columnWidth }} className="shrink-0" />
            </div>

            {/* Today Indicator Line */}
            {todayPosition !== null && (
                <div
                    className="absolute top-0 bottom-0 w-0.5 bg-red-500/80 dark:bg-red-400/80 z-30 pointer-events-none"
                    style={{
                        left: `calc(var(--gantt-sidebar-width) + ${todayPosition}px)`,
                    }}
                >
                    <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-red-500 shadow-sm" />
                </div>
            )}

            {/* Content Container (Vertical List of Rows) */}
            <div className="flex flex-col relative z-20">
                {children}
            </div>
        </div>
    );
}
