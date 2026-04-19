"use client";

import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { TaskRow } from "./task-row";
import { Calendar } from "lucide-react";
import { ProjectRow } from "./project-row";
import { ProjectOption } from "../shared/types";
import { exportGanttToExcel, exportGanttToPDF } from "./export-utils";
import { GanttSubtask, GanttTask, TimelineGranularity } from "./types";
import { TimelineHeader, TimelineGrid } from "./timeline-grid";
import { calculateTimelineRange, getDaysBetween } from "./utils";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { ProjectMembersType } from "@/data/project/get-project-members";
import { DependencyLines } from "./dependency-lines";

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
    loadingSubtasks?: Set<string>;
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
const PROJECTS_PER_PAGE = 20;

export function GanttChart({
    tasks,
    workspaceId,
    projectId,
    className,
    onSubtaskClick,
    onSubTaskUpdate,
    showProjectFilter,
    projects,
    groupByProject = false,
    projectCounts,
    members,
    currentUser,
    hasMore,
    onLoadMore,
    onRequestSubtasks,
    loadingSubtasks,
    isLoading,
    permissions
}: GanttChartProps & { groupByProject?: boolean }) {
    const [granularity, setGranularity] = useState<TimelineGranularity>('days');
    const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
    const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
    const [showDetails, setShowDetails] = useState(true);
    const [highlightedSubtaskId, setHighlightedSubtaskId] = useState<string | null>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const onToggleSubtaskHighlight = useCallback((id: string) => {
        setHighlightedSubtaskId(prev => (prev === id ? null : id));
    }, []);

    useEffect(() => {
        // Highlighting status tracking removed
    }, [highlightedSubtaskId]);


    // 🚀 Performance: Memoized projectMap for O(1) metadata lookups
    const projectMap = useMemo(() => {
        const map = new Map<string, ProjectOption>();
        projects?.forEach(p => map.set(p.id, p));
        return map;
    }, [projects]);

    // 🚀 Performance: Windowing logic remains for smoothness but fetching is now server-driven
    const [visibleTasksPerProject, setVisibleTasksPerProject] = useState<Map<string, number>>(new Map());

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

    // 🚀 Performance: Virtualization & Windowing
    const [scrollX, setScrollX] = useState(0);
    const [viewportWidth, setViewportWidth] = useState(1200);

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        setScrollX(e.currentTarget.scrollLeft);
    };

    // Track viewport size for horizontal clipping
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
            hasMoreProjects: hasMore, // Use server-side state
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


    // Infinite Scroll Implementation
    const projectsLoaderRef = useRef<HTMLDivElement>(null);
    const flatTasksLoaderRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                // 🛑 Avoid triggering loadMore if already loading
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
        setExpandedTasks((prev) => {
            const next = new Set(prev);
            if (next.has(taskId)) {
                next.delete(taskId);
            } else {
                next.add(taskId);
                
                // Lazy load subtasks if needed
                const task = tasks.find(t => t.id === taskId);
                if (task && (!task.subtasks || task.subtasks.length === 0)) {
                    onRequestSubtasks?.(taskId);
                }
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

    const handleSubtaskClick = (subtaskId: string) => {
        if (!onSubtaskClick) return;

        // Find the subtask to inject project metadata for the details sheet
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

    // 🚀 Global Coordinate Mapping for Dependency Lines
    const globalSubtasksWithPositions = useMemo(() => {
        const result: (GanttSubtask & { globalY: number })[] = [];
        let currentY = 0;

        // Pre-build a map of all subtasks for faster project lookup
        const allSubtaskMap = new Map<string, GanttSubtask>();
        tasks.forEach(t => t.subtasks?.forEach(s => allSubtaskMap.set(s.id, s)));

        if (groupByProject && groupedTasks) {
            groupedTasks.groups.forEach(group => {
                currentY += 32; // Project header height

                if (expandedProjects.has(group.id)) {
                    group.visibleTasks.forEach(task => {
                        currentY += 36; // Task header height

                        if (expandedTasks.has(task.id)) {
                            task.subtasks.forEach((st) => {
                                // Filter dependencies to only show within the same project
                                const projectFilteredDeps = st.dependsOnIds?.filter(depId => {
                                    const depSubtask = allSubtaskMap.get(depId);
                                    return depSubtask?.projectId === group.id;
                                });

                                result.push({
                                    ...st,
                                    dependsOnIds: projectFilteredDeps,
                                    globalY: currentY + 28 // Center of 32px row
                                });
                                currentY += 32; // Subtask row height
                            });
                        }
                    });
                }
            });

            // No project tasks
            groupedTasks.noProjectTasks.forEach(task => {
                currentY += 36;
                if (expandedTasks.has(task.id)) {
                    task.subtasks.forEach(st => {
                        result.push({
                            ...st,
                            globalY: currentY + 16
                        });
                        currentY += 32;
                    });
                }
            });
        } else {
            // Flat mode
            visibleFlatTasks.forEach(task => {
                currentY += 36;
                if (expandedTasks.has(task.id)) {
                    task.subtasks.forEach(st => {
                        result.push({
                            ...st,
                            globalY: currentY + 28
                        });
                        currentY += 32;
                    });
                }
            });
        }

        return result;
    }, [tasks, expandedTasks, expandedProjects, groupByProject, groupedTasks, visibleFlatTasks]);

    // Timeline Grid with Tasks
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
            {/* Gantt Container */}
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
                {/* Timeline Header */}
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
                />

                {/* Timeline Grid with Tasks */}
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
                    {/* Global Dependency Lines - Hidden as requested */}
                    {/* <div
                        className="absolute top-0 right-0 pointer-events-none z-10"
                        style={{
                            width: 'var(--gantt-total-width)',
                            marginLeft: 'var(--gantt-sidebar-width)'
                        }}
                    >
                        <DependencyLines
                            subtasks={globalSubtasksWithPositions}
                            timelineStart={timelineRange.start}
                            totalDays={totalDays}
                            granularity={granularity}
                        />
                    </div> */}
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
                                    showDetails={showDetails}
                                    onLoadMore={() => handleLoadMoreTasksForProject(group.id)}
                                    totalTasksCount={projectCounts ? (projectCounts[group.id] || 0) : group.totalTasks}
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
                                            isLoading={loadingSubtasks?.has(task.id)}
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
                                />
                            ))}

                            {/* Load More Projects Row */}
                            {groupedTasks.hasMoreProjects && (
                                <>
                                    <div ref={projectsLoaderRef} className="sticky left-0 z-30 w-[var(--gantt-sidebar-width)] min-w-[var(--gantt-sidebar-width)] flex items-center justify-center p-2 bg-white dark:bg-neutral-900 border-b border-r border-neutral-200 dark:border-neutral-700">
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
                                />
                            ))}

                            {/* Load More Flat Tasks Row */}
                            {!groupByProject && hasMore && (
                                <>
                                    <div ref={flatTasksLoaderRef} className="sticky left-0 z-30 w-[var(--gantt-sidebar-width)] min-w-[var(--gantt-sidebar-width)] flex items-center justify-center p-2 bg-white dark:bg-neutral-900 border-b border-r border-neutral-200 dark:border-neutral-700">
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
                    <div className="w-0.5 h-4 bg-red-500 dark:bg-red-400" />
                    <span>Today</span>
                </div>
                <div className="flex items-center gap-2">
                    <div
                        className="w-4 h-3 rounded border border-neutral-400/50 overflow-hidden"
                        style={{
                            backgroundImage: `repeating-linear-gradient(
                                45deg,
                                rgba(115, 115, 115, 0.1),
                                rgba(115, 115, 115, 0.1) 2px,
                                rgba(115, 115, 115, 0.4) 2px,
                                rgba(115, 115, 115, 0.4) 4px
                            )`,
                            backgroundColor: 'rgba(115, 115, 115, 0.05)'
                        }}
                    />
                    <span>Overdue Duration (Status Colored)</span>
                </div>

            </div>
        </div>
    );
}
