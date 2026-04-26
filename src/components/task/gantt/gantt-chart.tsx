"use client";

import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { TaskRow } from "./task-row";
import { Calendar } from "lucide-react";
import { ProjectRow } from "./project-row";
import { ProjectOption } from "../shared/types";
import { exportGanttToExcel, exportGanttToPDF } from "./export-utils";
import { GanttTask, TimelineGranularity } from "./types";
import { TimelineHeader, TimelineGrid } from "./timeline-grid";
import { calculateTimelineRange, getDaysBetween } from "./utils";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { ProjectMembersType } from "@/types/project";
import { GanttRowSkeleton } from "./gantt-row-skeleton";


interface GanttChartProps {
    tasks: GanttTask[];
    workspaceId?: string;
    projectId?: string;
    className?: string;
    onSubtaskClick?: (subtaskId: string) => void;
    onSubTaskUpdate?: (subTaskId: string, data: Partial<any>) => void;
    showProjectFilter?: boolean;
    projects?: ProjectOption[];
    selectedProjectId?: string;
    onProjectChange?: (projectId: string | null) => void;
    hasMore?: boolean;
    onLoadMore?: () => void;
    onRequestSubtasks?: (taskId: string) => void;
    onRequestMoreSubtasks?: (taskId: string) => void;
    onRequestProjectTasks?: (projectId: string) => void;
    loadingSubtasks?: Set<string>;
    loadingProjects?: Set<string>;
    isLoading?: boolean;
    projectCounts?: Record<string, number>;
    members?: ProjectMembersType;
    currentUser?: { id: string };
    permissions?: {
        isWorkspaceAdmin: boolean;
        leadProjectIds: string[];
        managedProjectIds: string[];
    };
}

const ITEMS_PER_PAGE = 50;
export function GanttChart({
    tasks,
    workspaceId,
    projectId,
    className,
    onSubtaskClick,
    onSubTaskUpdate,
    projects,
    groupByProject = false,
    projectCounts,
    members,
    currentUser,
    hasMore,
    onLoadMore,
    onRequestSubtasks,
    onRequestMoreSubtasks,
    onRequestProjectTasks,
    loadingSubtasks,
    loadingProjects,
    isLoading,
    permissions
}: GanttChartProps & { groupByProject?: boolean }) {
    const [granularity, setGranularity] = useState<TimelineGranularity>('days');
    const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
    const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
    const [isExpandAllMode, setIsExpandAllMode] = useState(false); // 🚀 Persistent expansion for lazy-loading
    const [showDetails, setShowDetails] = useState(true);
    const [highlightedSubtaskId, setHighlightedSubtaskId] = useState<string | null>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const onToggleSubtaskHighlight = useCallback((id: string) => {
        setHighlightedSubtaskId(prev => (prev === id ? null : id));
    }, []);

    // 🚀 Performance: Memoized projectMap for O(1) metadata lookups
    const projectMap = useMemo(() => {
        const map = new Map<string, ProjectOption>();
        projects?.forEach(p => map.set(p.id, p));
        return map;
    }, [projects]);

    const [visibleTasksPerProject, setVisibleTasksPerProject] = useState<Map<string, number>>(new Map());

    // Initial expansion effects
    const initializedRef = useRef(false);
    useEffect(() => {
        if (groupByProject && tasks.length > 0 && !initializedRef.current) {
            const firstTask = tasks.find(t => t.projectId);
            if (firstTask && firstTask.projectId) {
                const pid = firstTask.projectId;
                setTimeout(() => {
                    setExpandedProjects(new Set([pid]));
                }, 0);
            }
            initializedRef.current = true;
        }
    }, [groupByProject]);

    // 🚀 Performance: Virtualization & Windowing
    const [scrollX, setScrollX] = useState(0);
    const [viewportWidth, setViewportWidth] = useState(1200);

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        setScrollX(e.currentTarget.scrollLeft);
    };

    useEffect(() => {
        if (!scrollContainerRef.current) return;
        const updateWidth = () => setViewportWidth(scrollContainerRef.current?.clientWidth || 1200);
        updateWidth();
        window.addEventListener('resize', updateWidth);
        return () => window.removeEventListener('resize', updateWidth);
    }, []);

    const timelineRange = useMemo(() => calculateTimelineRange(tasks), [tasks]);
    const totalDays = useMemo(
        () => getDaysBetween(timelineRange.start, timelineRange.end) + 1,
        [timelineRange]
    );

    const groupedTasks = useMemo(() => {
        if (!groupByProject) return null;

        const groups = new Map<string, { name: string; tasks: GanttTask[]; color?: string }>();
        const noProjectTasks: GanttTask[] = [];

        tasks.forEach(task => {
            if (task.projectId) {
                if (!groups.has(task.projectId)) {
                    const projectFromMap = projectMap.get(task.projectId);
                    groups.set(task.projectId, {
                        name: projectFromMap?.name || "Unknown Project",
                        color: projectFromMap?.color,
                        tasks: []
                    });
                }
                groups.get(task.projectId)!.tasks.push(task);
            } else {
                noProjectTasks.push(task);
            }
        });

        const allGroups = Array.from(groups.entries());
        
        const paginatedGroups = allGroups.map(([pid, group]) => {
            const limit = visibleTasksPerProject.get(pid) || ITEMS_PER_PAGE;
            return {
                id: pid,
                ...group,
                allTasks: group.tasks,
                visibleTasks: group.tasks.slice(0, limit),
                totalTasks: group.tasks.length,
                hasMoreTasks: limit < group.tasks.length,
                highlightedSubtaskId,
                onToggleSubtaskHighlight
            };
        });

        return {
            groups: paginatedGroups,
            hasMoreProjects: hasMore, 
            noProjectTasks: noProjectTasks
        };
    }, [tasks, groupByProject, projects, hasMore, visibleTasksPerProject, highlightedSubtaskId, onToggleSubtaskHighlight]);

    const visibleFlatTasks = useMemo(() => {
        if (groupByProject) return [];
        return tasks;
    }, [tasks, groupByProject]);

    const handleLoadMoreTasksForProject = (pid: string) => {
        setVisibleTasksPerProject(prev => {
            const newMap = new Map(prev);
            const currentLimit = newMap.get(pid) || ITEMS_PER_PAGE;
            newMap.set(pid, currentLimit + ITEMS_PER_PAGE);
            return newMap;
        });
    };

    const projectsLoaderRef = useRef<HTMLDivElement>(null);
    const flatTasksLoaderRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && !isLoading) {
                    if (entry.target === projectsLoaderRef.current && hasMore) {
                        onLoadMore?.();
                    }
                    if (entry.target === flatTasksLoaderRef.current && !groupByProject && hasMore) {
                        onLoadMore?.();
                    }
                }
            });
        }, { threshold: 0.1, rootMargin: '200px' });

        if (projectsLoaderRef.current) observer.observe(projectsLoaderRef.current);
        if (flatTasksLoaderRef.current) observer.observe(flatTasksLoaderRef.current);

        return () => observer.disconnect();
    }, [hasMore, groupByProject, onLoadMore, isLoading]);

    useEffect(() => {
        if (!scrollContainerRef.current) return;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const daysFromStart = getDaysBetween(timelineRange.start, today);
        const columnWidth = granularity === 'days' ? 40 : granularity === 'weeks' ? 80 : 120;
        const todayPosition = daysFromStart * columnWidth;
        const containerWidth = scrollContainerRef.current.clientWidth;
        const scrollPosition = Math.max(0, todayPosition - containerWidth / 2 + 200);

        scrollContainerRef.current.scrollLeft = scrollPosition;
        setScrollX(scrollPosition);
    }, [granularity]);

    const toggleTask = (taskId: string) => {
        const isExpanding = !expandedTasks.has(taskId);
        if (!isExpanding) setIsExpandAllMode(false);

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
        const isExpanding = !expandedProjects.has(projectId);
        if (!isExpanding) setIsExpandAllMode(false);

        setExpandedProjects((prev) => {
            const next = new Set(prev);
            if (next.has(projectId)) {
                next.delete(projectId);
            } else {
                next.add(projectId);
            }
            return next;
        });

        if (isExpanding) {
            onRequestProjectTasks?.(projectId);
        }
    };

    const handleSubtaskClick = (subtaskId: string) => {
        if (!onSubtaskClick) return;

        const allSubtasks = tasks.flatMap(t => t.subtasks || []);
        const subtask = allSubtasks.find(s => s.id === subtaskId);

        if (subtask) {
            const project = projectMap.get(subtask.projectId);
            if (project) {
                (subtask as any).projectName = project.name;
                (subtask as any).projectColor = project.color;
            }
        }

        onSubtaskClick(subtaskId);
    };

    // 🚀 SYNC: Persistent expansion management
    useEffect(() => {
        if (!isExpandAllMode) {
            return;
        }

        // 1. Expand all current projects
        if (groupedTasks) {
            const allProjectIds = new Set(groupedTasks.groups.map(g => g.id));
            setExpandedProjects(prev => {
                if (prev.size === allProjectIds.size && [...allProjectIds].every(id => prev.has(id))) return prev;
                return new Set([...prev, ...allProjectIds]);
            });

            // Trigger fetches for projects with no items yet
            groupedTasks.groups.forEach(g => {
                if (g.allTasks.length === 0 && !loadingProjects?.has(g.id)) {
                    onRequestProjectTasks?.(g.id);
                }
            });
        }

        // 2. Expand all current tasks
        const allTaskIds = new Set(tasks.map(t => t.id));
        setExpandedTasks(prev => {
            if (prev.size === allTaskIds.size && [...allTaskIds].every(id => prev.has(id))) return prev;
            return new Set([...prev, ...allTaskIds]);
        });
    }, [isExpandAllMode, tasks, groupedTasks, loadingSubtasks, loadingProjects]);

    const expandAll = () => {
        setIsExpandAllMode(true);
    };

    const collapseAll = () => {
        setIsExpandAllMode(false);
        setExpandedTasks(new Set());
        setExpandedProjects(new Set());
    };

    const handleExport = async (type: 'pdf' | 'excel') => {
        if (type === 'excel') {
            await exportGanttToExcel(tasks, `gantt-export-${new Date().toISOString().split('T')[0]}.xlsx`);
            toast.success("Gantt chart exported! Upload this file to spreadsheet to see dynamic chart.");
        } else if (type === 'pdf') {
            await exportGanttToPDF(tasks, `gantt-export-${new Date().toISOString().split('T')[0]}.pdf`);
            toast.success("Gantt chart exported to PDF successfully.");
        }
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
        <div className={cn(
            "flex flex-col transition-all duration-300 ease-in-out",
            showDetails ? "[--gantt-sidebar-width:710px]" : "[--gantt-sidebar-width:250px]",
            "[--col-name:250px]",
            showDetails ? "[--col-assignee:100px]" : "[--col-assignee:0px]",
            showDetails ? "[--col-progress:60px]" : "[--col-progress:0px]",
            showDetails ? "[--col-status:80px]" : "[--col-status:0px]",
            showDetails ? "[--col-days:40px]" : "[--col-days:0px]",
            showDetails ? "[--col-dates:180px]" : "[--col-dates:0px]",
            className
        )}>
            <div
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className={cn(
                    "overflow-auto rounded-lg border border-neutral-200 dark:border-neutral-700",
                    workspaceId && !projectId ? "max-h-[70vh]" : "max-h-[65vh]",
                    "mt-0",
                    "bg-white dark:bg-neutral-900",
                    "shadow-sm",
                    "[&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar]:w-1.5",
                    "[&::-webkit-scrollbar-track]:bg-transparent",
                    "[&::-webkit-scrollbar-thumb]:bg-neutral-300 dark::[&::-webkit-scrollbar-thumb]:bg-neutral-600",
                    "[&::-webkit-scrollbar-thumb]:rounded-full"
                )}
                style={{
                    // @ts-ignore
                    "--gantt-header-height": granularity === 'days' ? '72px' : '40px'
                }}
            >
                <TimelineHeader
                    startDate={timelineRange.start}
                    endDate={timelineRange.end}
                    granularity={granularity}
                    tasks={tasks}
                    expandedTasks={expandedTasks}
                    expandedProjects={expandedProjects}
                    groupByProject={groupByProject}
                    onExpandAll={expandAll}
                    onCollapseAll={collapseAll}
                    onExport={handleExport}
                    onGranularityChange={setGranularity}
                    showDetails={showDetails}
                    onToggleDetails={() => setShowDetails(!showDetails)}
                    scrollX={scrollX}
                    viewportWidth={viewportWidth}
                    isBatchLoading={(loadingSubtasks?.size || 0) > 0 || (loadingProjects?.size || 0) > 0}
                />

                <TimelineGrid
                    startDate={timelineRange.start}
                    endDate={timelineRange.end}
                    granularity={granularity}
                    scrollX={scrollX}
                    viewportWidth={viewportWidth}
                    showDetails={showDetails}
                    tasks={groupByProject && groupedTasks
                        ? groupedTasks.groups.flatMap(g => g.allTasks).concat(groupedTasks.noProjectTasks)
                        : tasks
                    }
                >
                    {groupByProject && groupedTasks ? (
                        <>
                            {groupedTasks.groups.map((group) => (
                                <ProjectRow
                                    key={group.id}
                                    id={group.id}
                                    name={group.name}
                                    tasks={group.allTasks}
                                    timelineStart={timelineRange.start}
                                    totalDays={totalDays}
                                    isExpanded={expandedProjects.has(group.id)}
                                    onToggle={() => toggleProject(group.id)}
                                    color={group.color}
                                    hasMore={group.hasMoreTasks}
                                    showDetails={showDetails}
                                    onLoadMore={() => handleLoadMoreTasksForProject(group.id)}
                                    totalTasksCount={projectCounts ? (projectCounts[group.id] || 0) : group.totalTasks}
                                    isLoading={loadingProjects?.has(group.id)}
                                >
                                    {group.visibleTasks.map(task => (
                                        <TaskRow
                                            key={task.id}
                                            task={task}
                                            timelineStart={timelineRange.start}
                                            totalDays={totalDays}
                                            granularity={granularity}
                                            isExpanded={expandedTasks.has(task.id)}
                                            onToggle={() => toggleTask(task.id)}
                                            onSubtaskClick={handleSubtaskClick}
                                            onSubTaskUpdate={onSubTaskUpdate}
                                            allTasks={tasks}
                                            workspaceId={workspaceId}
                                            projectId={projectId || task.projectId}
                                            members={members}
                                            currentUser={currentUser}
                                            permissions={permissions}
                                            isNestedInProject={true}
                                            showDetails={showDetails}
                                            projectMap={projectMap}
                                            highlightedSubtaskId={highlightedSubtaskId}
                                            onToggleSubtaskHighlight={onToggleSubtaskHighlight}
                                            onLoadMoreSubtasks={onRequestMoreSubtasks}
                                            onInitialLoadSubtasks={onRequestSubtasks}
                                            isLoading={loadingSubtasks?.has(task.id)}
                                        />
                                    ))}
                                </ProjectRow>
                            ))}
                            {groupedTasks.noProjectTasks.map(task => (
                                <TaskRow
                                    key={task.id}
                                    task={task}
                                    timelineStart={timelineRange.start}
                                    totalDays={totalDays}
                                    granularity={granularity}
                                    isExpanded={expandedTasks.has(task.id)}
                                    onToggle={() => toggleTask(task.id)}
                                    onSubtaskClick={handleSubtaskClick}
                                    onSubTaskUpdate={onSubTaskUpdate}
                                    allTasks={tasks}
                                    workspaceId={workspaceId}
                                    projectId={projectId || task.projectId}
                                    members={members}
                                    currentUser={currentUser}
                                    permissions={permissions}
                                    showDetails={showDetails}
                                    projectMap={projectMap}
                                    isLoading={loadingSubtasks?.has(task.id)}
                                    onLoadMoreSubtasks={onRequestMoreSubtasks}
                                    onInitialLoadSubtasks={onRequestSubtasks}
                                />
                            ))}

                            {groupedTasks.hasMoreProjects && (
                                <>
                                    <GanttRowSkeleton 
                                        ref={projectsLoaderRef} 
                                        className="bg-neutral-50/10 dark:bg-neutral-800/5"
                                    />

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
                                    granularity={granularity}
                                    isExpanded={expandedTasks.has(task.id)}
                                    onToggle={() => toggleTask(task.id)}
                                    onSubtaskClick={handleSubtaskClick}
                                    onSubTaskUpdate={onSubTaskUpdate}
                                    allTasks={tasks}
                                    workspaceId={workspaceId}
                                    projectId={projectId || task.projectId}
                                    members={members}
                                    currentUser={currentUser}
                                    permissions={permissions}
                                    showDetails={showDetails}
                                    projectMap={projectMap}
                                    isLoading={loadingSubtasks?.has(task.id)}
                                    onLoadMoreSubtasks={onRequestMoreSubtasks}
                                    onInitialLoadSubtasks={onRequestSubtasks}
                                />
                            ))}

                            {!groupByProject && hasMore && (
                                <>
                                    <GanttRowSkeleton 
                                        ref={flatTasksLoaderRef} 
                                        className="bg-neutral-50/10 dark:bg-neutral-800/5"
                                    />

                                </>
                            )}
                        </>
                    )}
                </TimelineGrid>
            </div>

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
                    <div className="w-0.5 h-4 bg-red-500 dark:bg-red-400" />
                    <span>Today</span>
                </div>
            </div>
        </div>
    );
}
