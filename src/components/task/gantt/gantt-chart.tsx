"use client";

import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { TaskRow } from "./task-row";
import { ProjectRow } from "./project-row";
import { Button } from "@/components/ui/button";
import { ProjectOption } from "../shared/types";
import { exportGanttToExcel } from "./export-utils";
import { GanttTask, TimelineGranularity } from "./types";
import { updateSubtaskPositions } from "@/actions/task/gantt";
import { TimelineHeader, TimelineGrid } from "./timeline-grid";
import { calculateTimelineRange, getDaysBetween } from "./utils";
import { useState, useMemo, useTransition, useEffect, useRef } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Calendar, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Folder, Download } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface GanttChartProps {
    tasks: GanttTask[];
    workspaceId?: string;
    projectId?: string;
    className?: string;
    onSubtaskClick?: (subtaskId: string) => void;
    showProjectFilter?: boolean;
    projects?: ProjectOption[];
    selectedProjectId?: string;
    onProjectChange?: (projectId: string | null) => void;
    hasMore?: boolean;
    onLoadMore?: () => void;
    projectCounts?: Record<string, number>;
}

const ITEMS_PER_PAGE = 50;
const PROJECTS_PER_PAGE = 20;

export function GanttChart({
    tasks,
    workspaceId,
    projectId,
    className,
    onSubtaskClick,
    showProjectFilter,
    projects,
    groupByProject = false,
    projectCounts
}: GanttChartProps & { groupByProject?: boolean }) {
    const [granularity, setGranularity] = useState<TimelineGranularity>('days');
    const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
    const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
    const [isPending, startTransition] = useTransition();
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Pagination State
    const [visibleProjectCount, setVisibleProjectCount] = useState(PROJECTS_PER_PAGE);
    const [visibleTasksPerProject, setVisibleTasksPerProject] = useState<Map<string, number>>(new Map());
    const [visibleFlatCount, setVisibleFlatCount] = useState(ITEMS_PER_PAGE);

    // Initial expansion effects
    const initializedRef = useRef(false);
    useEffect(() => {
        if (groupByProject && tasks.length > 0 && !initializedRef.current) {
            const firstTask = tasks.find(t => t.projectId);
            if (firstTask && firstTask.projectId) {
                const pid = firstTask.projectId;
                // Use setTimeout to avoid setState excessive warning during hydration if any
                setTimeout(() => {
                    setExpandedProjects(new Set([pid]));
                }, 0);
            }
            initializedRef.current = true;
        }
    }, [groupByProject]); // Reduced dependency to just grouping mode

    const timelineRange = useMemo(() => calculateTimelineRange(tasks), [tasks]);
    const totalDays = useMemo(
        () => getDaysBetween(timelineRange.start, timelineRange.end),
        [timelineRange]
    );

    const groupedTasks = useMemo(() => {
        if (!groupByProject) return null;

        const groups = new Map<string, { name: string; tasks: GanttTask[]; color?: string }>();
        const noProjectTasks: GanttTask[] = [];

        tasks.forEach(task => {
            if (task.projectId) {
                if (!groups.has(task.projectId)) {
                    // Try to find project info from props or task
                    const projectFromProps = projects?.find(p => p.id === task.projectId);
                    groups.set(task.projectId, {
                        name: projectFromProps?.name || task.projectName || "Unknown Project",
                        color: projectFromProps?.color,
                        tasks: []
                    });
                }
                groups.get(task.projectId)!.tasks.push(task);
            } else {
                noProjectTasks.push(task);
            }
        });

        const allGroups = Array.from(groups.entries());
        const paginatedGroups = allGroups.slice(0, visibleProjectCount).map(([pid, group]) => {
            const limit = visibleTasksPerProject.get(pid) || ITEMS_PER_PAGE;
            return {
                id: pid,
                ...group,
                allTasks: group.tasks,
                visibleTasks: group.tasks.slice(0, limit),
                totalTasks: group.tasks.length,
                hasMoreTasks: limit < group.tasks.length
            };
        });

        return {
            groups: paginatedGroups,
            hasMoreProjects: visibleProjectCount < allGroups.length,
            noProjectTasks: noProjectTasks
        };
    }, [tasks, groupByProject, projects, visibleProjectCount, visibleTasksPerProject]);

    const visibleFlatTasks = useMemo(() => {
        if (groupByProject) return [];
        return tasks.slice(0, visibleFlatCount);
    }, [tasks, groupByProject, visibleFlatCount]);

    const handleLoadMoreProjects = () => {
        setVisibleProjectCount(prev => prev + PROJECTS_PER_PAGE);
    };

    const handleLoadMoreTasksForProject = (pid: string) => {
        setVisibleTasksPerProject(prev => {
            const newMap = new Map(prev);
            const currentLimit = newMap.get(pid) || ITEMS_PER_PAGE;
            newMap.set(pid, currentLimit + ITEMS_PER_PAGE);
            return newMap;
        });
    };

    const handleLoadMoreFlat = () => {
        setVisibleFlatCount(prev => prev + ITEMS_PER_PAGE);
    };

    // Infinite Scroll Implementation
    const projectsLoaderRef = useRef<HTMLDivElement>(null);
    const flatTasksLoaderRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    if (entry.target === projectsLoaderRef.current && groupedTasks?.hasMoreProjects) {
                        handleLoadMoreProjects();
                    }
                    if (entry.target === flatTasksLoaderRef.current && !groupByProject && tasks.length > visibleFlatCount) {
                        handleLoadMoreFlat();
                    }
                }
            });
        }, { threshold: 0.1, rootMargin: '200px' });

        if (projectsLoaderRef.current) observer.observe(projectsLoaderRef.current);
        if (flatTasksLoaderRef.current) observer.observe(flatTasksLoaderRef.current);

        return () => observer.disconnect();
    }, [groupedTasks?.hasMoreProjects, groupByProject, tasks.length, visibleFlatCount]);

    useEffect(() => {
        if (!scrollContainerRef.current) return;

        // Auto-scroll logic
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const daysFromStart = getDaysBetween(timelineRange.start, today);
        const columnWidth = granularity === 'days' ? 40 : granularity === 'weeks' ? 80 : 120;
        const todayPosition = daysFromStart * columnWidth;
        const containerWidth = scrollContainerRef.current.clientWidth;
        const scrollPosition = Math.max(0, todayPosition - containerWidth / 2 + 200);

        scrollContainerRef.current.scrollLeft = scrollPosition;
    }, [timelineRange, granularity]);

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

    const toggleProject = (projectId: string) => {
        setExpandedProjects((prev) => {
            const next = new Set(prev);
            if (next.has(projectId)) {
                next.delete(projectId);
            } else {
                next.add(projectId);
            }
            return next;
        });
    };

    const expandAll = () => {
        setExpandedTasks(new Set(tasks.map((t) => t.id)));
        if (groupedTasks) {
            const allProjectIds = new Set<string>();
            groupedTasks.groups.forEach(g => allProjectIds.add(g.id));
            setExpandedProjects(allProjectIds);
        }
    };

    const collapseAll = () => {
        setExpandedTasks(new Set());
        setExpandedProjects(new Set());
    };

    const handleExport = async () => {
        await exportGanttToExcel(tasks, `gantt-export-${new Date().toISOString().split('T')[0]}.xlsx`);
        toast.success("Gantt chart exported! Upload this file to spreadsheet to see dynamic chart.");
    };

    const handleSubtaskReorder = (taskId: string, subtaskIds: string[]) => {
        if (!workspaceId) {
            toast.error("Cannot save changes - missing workspace information");
            return;
        }

        // For project ID, we need to be careful. 
        // If we are in workspace view, we might need the task's project ID.
        // However, the action likely expects the subtask's project.
        // Let's find the task to get its project ID if projectId prop is missing.
        let targetProjectId = projectId;
        if (!targetProjectId) {
            const task = tasks.find(t => t.id === taskId);
            targetProjectId = task?.projectId;
        }

        if (!targetProjectId) {
            toast.error("Cannot save changes - missing project information");
            return;
        }

        const toastId = toast.loading("Updating subtask order...");

        startTransition(async () => {
            const updates = subtaskIds.map((id, index) => ({
                subtaskId: id,
                newPosition: index
            }));

            const result = await updateSubtaskPositions(taskId, targetProjectId!, workspaceId, updates);

            if (result.success) {
                toast.success("Subtask order updated successfully", { id: toastId });
            } else {
                toast.error(result.message || "Failed to update subtask order", { id: toastId });
            }
        });
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
        <div className={cn("flex flex-col [--gantt-sidebar-width:140px] sm:[--gantt-sidebar-width:200px]", className)}>
            {/* Toolbar */}
            <div className="flex items-center justify-between gap-2 mb-4 px-1 min-w-0">
                <div className="flex items-center gap-1 sm:gap-2 min-w-0">
                    {/* Expand / Collapse toggle */}
                    {(() => {
                        const allExpanded = tasks.length > 0 && tasks.every(t => expandedTasks.has(t.id));
                        return (
                            <TooltipProvider delayDuration={200}>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={allExpanded ? collapseAll : expandAll}
                                            className="h-8 w-8 sm:w-auto px-0 sm:px-3 text-xs"
                                        >
                                            {allExpanded
                                                ? <ChevronsDownUp className="h-4 w-4 sm:mr-1" />
                                                : <ChevronsUpDown className="h-4 w-4 sm:mr-1" />
                                            }
                                            <span className="hidden sm:inline">
                                                {allExpanded ? 'Collapse All' : 'Expand All'}
                                            </span>
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="bottom" className="sm:hidden">
                                        {allExpanded ? 'Collapse All' : 'Expand All'}
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        );
                    })()}

                    {/* Export — icon only on mobile, full label on sm+ */}
                    <TooltipProvider delayDuration={200}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleExport}
                                    className="h-8 w-8 sm:w-auto px-0 sm:px-3 gap-0 sm:gap-2 text-xs"
                                >
                                    <Download className="h-3.5 w-3.5" />
                                    <span className="hidden sm:inline">Export to Sheets</span>
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="sm:hidden">Export to Sheets</TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>

                <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                    {/* Granularity picker — icon+text on sm+, icon only on mobile */}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="h-8 gap-1 sm:gap-2 px-2 sm:px-3 text-xs">
                                <Calendar className="h-4 w-4 shrink-0" />
                                <span className="hidden sm:inline">
                                    {granularity === 'days' ? 'Days' : granularity === 'weeks' ? 'Weeks' : 'Months'}
                                </span>
                                <ChevronDown className="h-3 w-3 hidden sm:block shrink-0" />
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
            </div>

            {/* Gantt Container */}
            <div
                ref={scrollContainerRef}
                className={cn(
                    "max-h-[calc(100dvh-280px)] overflow-auto rounded-lg border border-neutral-200 dark:border-neutral-700",
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
                    tasks={groupByProject && groupedTasks
                        ? groupedTasks.groups.flatMap(g => g.allTasks).concat(groupedTasks.noProjectTasks)
                        : tasks
                    }
                >
                    {groupByProject && groupedTasks ? (
                        <>
                            {/* Convert groups to array and paginate */}
                            {groupedTasks.groups.map((group) => (
                                <ProjectRow
                                    key={group.id}
                                    id={group.id}
                                    name={group.name}
                                    tasks={group.allTasks} // Pass all tasks for project bar calculation
                                    timelineStart={timelineRange.start}
                                    totalDays={totalDays}
                                    isExpanded={expandedProjects.has(group.id)}
                                    onToggle={() => toggleProject(group.id)}
                                    color={group.color}
                                    hasMore={group.hasMoreTasks}
                                    onLoadMore={() => handleLoadMoreTasksForProject(group.id)}
                                    totalTasksCount={projectCounts ? (projectCounts[group.id] || 0) : group.totalTasks}
                                >
                                    {group.visibleTasks.map(task => (
                                        <TaskRow
                                            key={task.id}
                                            task={task}
                                            timelineStart={timelineRange.start}
                                            totalDays={totalDays}
                                            isExpanded={expandedTasks.has(task.id)}
                                            onToggle={() => toggleTask(task.id)}
                                            onSubtaskReorder={handleSubtaskReorder}
                                            onSubtaskClick={onSubtaskClick}
                                            allTasks={tasks}
                                            workspaceId={workspaceId}
                                            projectId={projectId || task.projectId}
                                            isNestedInProject={true}
                                        />
                                    ))}
                                </ProjectRow>
                            ))}
                            {/* Tasks without project */}
                            {groupedTasks.noProjectTasks.map(task => (
                                <TaskRow
                                    key={task.id}
                                    task={task}
                                    timelineStart={timelineRange.start}
                                    totalDays={totalDays}
                                    isExpanded={expandedTasks.has(task.id)}
                                    onToggle={() => toggleTask(task.id)}
                                    onSubtaskReorder={handleSubtaskReorder}
                                    onSubtaskClick={onSubtaskClick}
                                    allTasks={tasks}
                                    workspaceId={workspaceId}
                                    projectId={projectId || task.projectId}
                                />
                            ))}

                            {/* Load More Projects Row */}
                            {groupedTasks.hasMoreProjects && (
                                <>
                                    <div ref={projectsLoaderRef} className="sticky left-0 z-30 w-[200px] min-w-[200px] flex items-center justify-center p-2 bg-white dark:bg-neutral-900 border-b border-r border-neutral-200 dark:border-neutral-700">
                                        <span className="text-xs text-muted-foreground">Loading more projects...</span>
                                    </div>
                                    <div className="bg-neutral-50/30 dark:bg-neutral-900/10 border-b border-neutral-200 dark:border-neutral-700" />
                                </>
                            )}
                        </>
                    ) : (
                        <>
                            {visibleFlatTasks.map((task) => (
                                <TaskRow
                                    key={task.id}
                                    task={task}
                                    timelineStart={timelineRange.start}
                                    totalDays={totalDays}
                                    isExpanded={expandedTasks.has(task.id)}
                                    onToggle={() => toggleTask(task.id)}
                                    onSubtaskReorder={handleSubtaskReorder}
                                    onSubtaskClick={onSubtaskClick}
                                    allTasks={tasks}
                                    workspaceId={workspaceId}
                                    projectId={projectId}
                                />
                            ))}

                            {/* Load More Flat Tasks Row */}
                            {!groupByProject && (tasks.length > visibleFlatCount) && (
                                <>
                                    <div ref={flatTasksLoaderRef} className="sticky left-0 z-30 w-[200px] min-w-[200px] flex items-center justify-center p-2 bg-white dark:bg-neutral-900 border-b border-r border-neutral-200 dark:border-neutral-700">
                                        <span className="text-xs text-muted-foreground">Loading more tasks...</span>
                                    </div>
                                    <div className="bg-neutral-50/30 dark:bg-neutral-900/10 border-b border-neutral-200 dark:border-neutral-700" />
                                </>
                            )}
                        </>
                    )}
                </TimelineGrid>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-6 mt-4 px-1 text-xs text-muted-foreground flex-wrap">
                <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-neutral-400/50" />
                    <span>Project</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-4 h-3 rounded bg-blue-600 dark:bg-blue-500" />
                    <span>Task</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-4 h-2 rounded bg-blue-300 dark:bg-blue-400" />
                    <span>Subtask</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-4 h-2 rounded bg-green-400 dark:bg-green-500" />
                    <span>Completed</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-4 h-2 rounded bg-amber-400 dark:bg-amber-500" />
                    <span>Blocked</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-0.5 h-4 bg-red-500 dark:bg-red-400" />
                    <span>Today</span>
                </div>
                <div className="flex items-center gap-2">
                    <svg width="20" height="10" className="text-blue-500">
                        <line x1="0" y1="5" x2="14" y2="5" stroke="currentColor" strokeWidth="2" />
                        <polygon points="14,2 20,5 14,8" fill="currentColor" />
                    </svg>
                    <span>Dependency</span>
                </div>
            </div>
        </div>
    );
}
