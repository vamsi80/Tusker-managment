"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { computeTaskDates, calculateBarPosition, formatDateRange, getDaysBetween, getAggregateStatus, getStatusColor } from "./utils";
import { SortableSubtaskList } from "./sortable-subtask-list";
import { ProjectMembersType } from "@/data/project/get-project-members";

import { cn } from "@/lib/utils";
import { GanttRowSkeleton } from "./gantt-row-skeleton";

import { Button } from "@/components/ui/button";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { GanttTask } from "./types";
import { ProjectOption } from "../shared/types";

// ...
// ... (imports)

const SUBTASKS_PER_PAGE = 10;

interface TaskRowProps {
    task: GanttTask;
    timelineStart: Date;
    totalDays: number;
    isExpanded: boolean;
    onToggle: () => void;
    onSubtaskClick?: (subtaskId: string) => void;
    onSubTaskUpdate?: (subTaskId: string, data: Partial<any>) => void;
    allTasks?: GanttTask[]; // All tasks for dependency picker
    workspaceId?: string;
    projectId?: string;
    members?: ProjectMembersType;
    isNestedInProject?: boolean;
    currentUser?: { id: string };
    permissions?: {
        isWorkspaceAdmin: boolean;
        leadProjectIds: string[];
        managedProjectIds: string[];
    };
    showDetails: boolean;
    projectMap: Map<string, ProjectOption>;
    granularity: 'days' | 'weeks' | 'months';
    highlightedSubtaskId?: string | null;
    onToggleSubtaskHighlight?: (id: string) => void;
    isLoading?: boolean;
    onLoadMoreSubtasks?: (taskId: string) => void;
    onInitialLoadSubtasks?: (taskId: string) => void;
}

export function TaskRow({
    task,
    timelineStart,
    totalDays,
    isExpanded,
    onToggle,
    onSubtaskClick,
    onSubTaskUpdate,
    allTasks,
    workspaceId,
    projectId,
    members,
    isNestedInProject = false,
    currentUser,
    permissions,
    showDetails,
    projectMap,
    granularity,
    highlightedSubtaskId,
    onToggleSubtaskHighlight,
    isLoading = false,
    onLoadMoreSubtasks,
    onInitialLoadSubtasks
}: TaskRowProps) {

    const [visibleSubtaskCount, setVisibleSubtaskCount] = useState(SUBTASKS_PER_PAGE);

    const { start, end } = useMemo(() => computeTaskDates(task), [task]);

    const position = useMemo(() => {
        if (!start || !end) return null;
        return calculateBarPosition(start, end, timelineStart, totalDays);
    }, [start, end, timelineStart, totalDays]);

    const aggregateStatus = useMemo(() => {
        if (!task.subtasks || task.subtasks.length === 0) return task.status;
        return getAggregateStatus(task.subtasks);
    }, [task.subtasks, task.status]);

    const currentProject = projectMap.get(task.projectId || projectId || "");
    const resolvedProjectColor = task.projectColor || currentProject?.color;

    const statusColor = useMemo(() => getStatusColor(aggregateStatus, resolvedProjectColor), [aggregateStatus, resolvedProjectColor]);

    const isSettled = aggregateStatus === 'COMPLETED' || aggregateStatus === 'CANCELLED' || aggregateStatus === 'HOLD';

    const isDelayed = useMemo(() => {
        if (!end) return false;
        
        // For parent tasks, if it's settled, use the latest updatedAt of subtasks or the task itself
        const referenceDate = new Date();
        if (isSettled) {
            let latestUpdate = task.updatedAt ? new Date(task.updatedAt) : new Date(0);
            if (task.subtasks) {
                task.subtasks.forEach(s => {
                    if (s.updatedAt) {
                        const d = new Date(s.updatedAt);
                        if (d > latestUpdate) latestUpdate = d;
                    }
                });
            }
            if (latestUpdate.getTime() > 0) {
                referenceDate.setTime(latestUpdate.getTime());
            }
        }
            
        referenceDate.setHours(0, 0, 0, 0);
        const taskEnd = new Date(end);
        taskEnd.setHours(0, 0, 0, 0);
        
        return taskEnd < referenceDate;
    }, [isSettled, task.updatedAt, task.subtasks, end]);

    const delayWidthPercent = useMemo(() => {
        if (!isDelayed || !end) return 0;
        
        const referenceDate = new Date();
        if (isSettled) {
            let latestUpdate = task.updatedAt ? new Date(task.updatedAt) : new Date(0);
            if (task.subtasks) {
                task.subtasks.forEach(s => {
                    if (s.updatedAt) {
                        const d = new Date(s.updatedAt);
                        if (d > latestUpdate) latestUpdate = d;
                    }
                });
            }
            if (latestUpdate.getTime() > 0) {
                referenceDate.setTime(latestUpdate.getTime());
            }
        }
            
        referenceDate.setHours(0, 0, 0, 0);
        const taskEnd = new Date(end);
        taskEnd.setHours(0, 0, 0, 0);
        
        const delayDays = getDaysBetween(taskEnd, referenceDate);
        return (delayDays / totalDays) * 100;
    }, [isDelayed, isSettled, task.updatedAt, task.subtasks, end, totalDays]);

    const hasSubtasks = (task.subtasks && task.subtasks.length > 0) || (task.subtaskCount !== undefined && task.subtaskCount > 0);
    const isLoaded = task.subtasks !== undefined;
    const needsInitialLoad = isExpanded && hasSubtasks && !isLoaded;

    // Handle load more subtasks
    const handleLoadMoreSubtasks = () => {
        setVisibleSubtaskCount(prev => Math.min(prev + SUBTASKS_PER_PAGE, task.subtasks?.length || 0));
    };

    // 🚀 SYNC: Automatically show all subtasks if they were just loaded from server (e.g. Expand All or Load More)
    useEffect(() => {
        if (task.subtasks && task.subtasks.length > visibleSubtaskCount) {
             setVisibleSubtaskCount(task.subtasks.length);
        }
    }, [task.subtasks?.length]);


    // Get visible subtasks
    const visibleSubtasks = (task.subtasks || []).slice(0, visibleSubtaskCount);
    
    // 🧠 Evaluation logic for mixed client/server pagination
    const hasMoreInMemory = visibleSubtaskCount < (task.subtasks?.length || 0);
    const hasMoreOnServer = !!task.hasMoreSubtasks;
    const canLoadMore = hasMoreInMemory || hasMoreOnServer;

    const handleLoadMoreTrigger = () => {
        if (hasMoreInMemory) {
            handleLoadMoreSubtasks();
        } else if (hasMoreOnServer && onLoadMoreSubtasks) {
            onLoadMoreSubtasks(task.id);
        }
    };

    // A single sentinel handles first-load and later pagination once the expanded area becomes visible.
    const subtaskLoaderRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!subtaskLoaderRef.current) return;
        const observer = new IntersectionObserver(([entry]) => {
            if (!entry.isIntersecting || isLoading) return;

            if (needsInitialLoad) {
                onInitialLoadSubtasks?.(task.id);
                return;
            }

            if (canLoadMore) {
                handleLoadMoreTrigger();
            }
        }, { threshold: 0.1, rootMargin: '240px 0px' });
        observer.observe(subtaskLoaderRef.current);
        return () => observer.disconnect();
    }, [
        canLoadMore,
        hasMoreInMemory,
        hasMoreOnServer,
        isLoading,
        needsInitialLoad,
        onInitialLoadSubtasks,
        onLoadMoreSubtasks,
        task.id
    ]);

    const allowedUserIds = currentProject?.memberIds;

    return (
        <div className="flex flex-col">
            {/* Task Row Header */}
            <div
                className="grid"
                style={{ gridTemplateColumns: 'var(--gantt-sidebar-width) var(--gantt-total-width)' }}
            >
                {/* Left Panel - Task Name (Aligns with columns but hides details for parent) */}
                {/* 1-2. Sidebar + Metadata (Transitioned width) */}
                <div
                    className={cn(
                        "sticky left-0 z-30 flex items-center border-r border-neutral-200 dark:border-neutral-700 h-full w-[var(--gantt-sidebar-width)] min-w-[var(--gantt-sidebar-width)] shrink-0 transition-[width] duration-300 ease-in-out overflow-hidden",
                        "bg-neutral-100 dark:bg-neutral-800"
                    )}
                >
                    {/* 1. Task Name Column */}
                    <div className={cn(
                        "w-[var(--col-name)] flex items-center gap-1 px-3 py-2 min-h-[36px] shrink-0 border-r border-neutral-200 dark:border-neutral-700 h-full",
                        isNestedInProject && "pl-6"
                    )}>
                        <button
                            onClick={onToggle}
                            className={cn(
                                "p-0.5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700",
                                "transition-colors duration-150",
                                !hasSubtasks && !isLoading && "invisible"
                            )}
                            disabled={isLoading}
                            aria-expanded={isExpanded}
                            aria-label={isExpanded ? "Collapse" : "Expand"}
                        >
                            {isLoading ? (
                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                            ) : isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                        </button>
                        <span className="font-semibold text-sm text-foreground truncate">
                            {task.name}
                        </span>
                        {hasSubtasks && (
                            <span className="text-xs text-muted-foreground ml-auto bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded-full">
                                {(task.subtasks && task.subtasks.length > 0) ? task.subtasks.length : task.subtaskCount}
                            </span>
                        )}
                        {isLoading && (
                             <span className="text-[10px] text-muted-foreground ml-auto animate-pulse">Loading...</span>
                        )}
                    </div>

                    {/* 2-5. Detail Columns for Parent Task */}
                    {showDetails && (
                        <>
                            {/* 2. Assignee Column */}
                            <div className="w-[var(--col-assignee)] shrink-0 border-r border-neutral-200 dark:border-neutral-700 h-full px-2" />
                            <div className="w-[var(--col-progress)] shrink-0 border-r border-neutral-200 dark:border-neutral-700 h-full px-2 flex items-center justify-center">
                                <span className={cn(
                                    "text-xs font-medium px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800",
                                    task.progress === 100 ? "text-green-600 dark:text-green-400" : "text-muted-foreground"
                                )}>
                                    {task.progress}%
                                </span>
                            </div>
                            <div className="w-[var(--col-status)] shrink-0 border-r border-neutral-200 dark:border-neutral-700 h-full px-2 bg-neutral-50/10 dark:bg-neutral-800/5" />
                            <div className="w-[var(--col-days)] shrink-0 border-r border-neutral-200 dark:border-neutral-700 h-full px-2 bg-neutral-50/10 dark:bg-neutral-800/5" />
                            <div className="w-[var(--col-dates)] shrink-0 h-full px-2 bg-neutral-50/10 dark:bg-neutral-800/5" />
                        </>
                    )}
                </div>

                {/* Right Panel - Task Bar */}
                <div
                    className={cn(
                        "relative min-h-[36px] flex items-center w-full",
                        "bg-neutral-100/50 dark:bg-neutral-800/40",
                        "border-b border-neutral-200 dark:border-neutral-700",
                        "hover:bg-neutral-200/50 dark:hover:bg-neutral-700/50",
                        "transition-colors duration-150"
                    )}
                >
                    {position ? (
                        <TooltipProvider delayDuration={100}>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div
                                        className={cn(
                                            "absolute h-4 rounded-full cursor-pointer",
                                            "hover:brightness-110",
                                            "transition-all duration-200 ease-out",
                                            "shadow-md hover:shadow-lg",
                                            "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
                                        )}
                                        style={{
                                            left: `${position.left}%`,
                                            width: `${position.width}%`,
                                            minWidth: '12px',
                                            backgroundColor: statusColor,
                                            opacity: 0.8

                                        }}
                                        tabIndex={0}
                                        role="button"
                                        aria-label={`${task.name}: ${formatDateRange(start, end)}`}
                                    >
                                        {/* Progress Overlay */}
                                        <div
                                            className="absolute h-full rounded-full bg-black/20 dark:bg-white/20 top-0 left-0 transition-all duration-300"
                                            style={{ width: `${task.progress}%` }}
                                        />
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent
                                    side="top"
                                    className="bg-popover text-popover-foreground border shadow-lg"
                                >
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <p className="font-semibold text-sm">{task.name}</p>
                                            {isDelayed && !isSettled && (
                                                <span className="px-1.5 py-0.5 text-xs bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded flex items-center gap-1 font-bold animate-pulse">
                                                    OVERDUE
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            {formatDateRange(start, end)}
                                        </p>
                                        {start && end && (
                                            <p className="text-xs text-muted-foreground whitespace-nowrap">
                                                {getDaysBetween(start, end) + 1} days 
                                                {isDelayed && ` (+${Math.round((delayWidthPercent / 100) * totalDays)}d delay)`}
                                            </p>
                                        )}
                                        <div className="flex items-center gap-2 pt-1 border-t border-neutral-200 dark:border-neutral-700 mt-1">
                                            <div className="flex-1 h-1.5 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                                                <div 
                                                    className="h-full bg-blue-500 rounded-full" 
                                                    style={{ width: `${task.progress}%` }} 
                                                />
                                            </div>
                                            <span className="text-[10px] font-bold">{task.progress}%</span>
                                        </div>
                                    </div>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    ): null}

                    {/* Parent Delay Extension Bar */}
                    {position && delayWidthPercent > 0 && (
                        <div 
                            className="absolute top-[10px] h-3 rounded-r-full z-0 overflow-hidden"
                            style={{
                                left: `${position.left + position.width}%`,
                                width: `${delayWidthPercent}%`,
                                backgroundImage: `repeating-linear-gradient(
                                    ${isSettled ? '-45deg' : '45deg'},
                                    ${statusColor}1A,
                                    ${statusColor}1A 4px,
                                    ${statusColor}66 4px,
                                    ${statusColor}66 8px
                                )`,
                                border: `1px solid ${statusColor}80`,
                                borderLeft: 'none',
                                backgroundColor: `${statusColor}0D`
                            }}
                            title={`Delayed by ${Math.round((delayWidthPercent / 100) * totalDays)} days`}
                        />
                    )}
                </div>
            </div>

            {/* Subtask Rows - Sortable */}
            {isExpanded && hasSubtasks && (
                <div className="flex flex-col">
                    {isLoaded && (
                        <SortableSubtaskList
                            subtasks={visibleSubtasks}
                            timelineStart={timelineStart}
                            totalDays={totalDays}
                            showDetails={showDetails}
                            onSubtaskClick={onSubtaskClick}
                            onSubTaskUpdate={onSubTaskUpdate}
                            workspaceId={workspaceId || ""}
                            projectId={projectId || task.projectId}
                            members={members}
                            currentUser={currentUser}
                            permissions={permissions}
                            allowedUserIds={allowedUserIds}
                            allTasks={allTasks}
                            granularity={granularity}
                            highlightedSubtaskId={highlightedSubtaskId}
                            onToggleSubtaskHighlight={onToggleSubtaskHighlight}
                        />
                    )}

                    {(needsInitialLoad || canLoadMore || isLoading) && (
                        <GanttRowSkeleton 
                            ref={subtaskLoaderRef} 
                            className="bg-neutral-50/10 dark:bg-neutral-800/5 h-8"
                        />
                    )}
                </div>
            )}


        </div>
    );
}
