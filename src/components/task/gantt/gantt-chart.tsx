"use client";

import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { TaskRow } from "./task-row";
import { ProjectRow } from "./project-row";
import { Button } from "@/components/ui/button";
import { ProjectOption } from "../shared/types";
import { GanttTask, TimelineGranularity } from "./types";
import { Calendar, ChevronDown, Folder } from "lucide-react";
import { updateSubtaskPositions } from "@/actions/task/gantt";
import { TimelineHeader, TimelineGrid } from "./timeline-grid";
import { calculateTimelineRange, getDaysBetween } from "./utils";
import { useState, useMemo, useTransition, useEffect, useRef } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

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
}

const ITEMS_PER_PAGE = 10;
const PROJECTS_PER_PAGE = 5;

export function GanttChart({
    tasks,
    workspaceId,
    projectId,
    className,
    onSubtaskClick,
    showProjectFilter,
    projects,
    selectedProjectId,
    onProjectChange,
    groupByProject = false
}: GanttChartProps & { groupByProject?: boolean }) {
    const [granularity, setGranularity] = useState<TimelineGranularity>('days');
    const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
    // Initialize all projects as expanded by default
    const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
    const [isPending, startTransition] = useTransition();
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Pagination State
    const [visibleProjectCount, setVisibleProjectCount] = useState(PROJECTS_PER_PAGE);
    const [visibleTasksPerProject, setVisibleTasksPerProject] = useState<Map<string, number>>(new Map());
    const [visibleFlatCount, setVisibleFlatCount] = useState(ITEMS_PER_PAGE);

    // Reset pagination when mode changes or tasks change (filtering)
    useEffect(() => {
        setVisibleProjectCount(PROJECTS_PER_PAGE);
        setVisibleTasksPerProject(new Map());
        setVisibleFlatCount(ITEMS_PER_PAGE);
    }, [groupByProject, tasks]);

    // Initial expansion effects - Only expand first project by default
    const initializedRef = useRef(false);
    useEffect(() => {
        if (groupByProject && tasks.length > 0 && !initializedRef.current) {
            const firstTask = tasks.find(t => t.projectId);
            if (firstTask && firstTask.projectId) {
                setExpandedProjects(new Set([firstTask.projectId]));
            }
            initializedRef.current = true;
        }
    }, [groupByProject, tasks]);

    const timelineRange = useMemo(() => calculateTimelineRange(tasks), [tasks]);
    const totalDays = useMemo(
        () => getDaysBetween(timelineRange.start, timelineRange.end),
        [timelineRange]
    );

    // Group tasks by project
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

        // Convert groups to array and paginate
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

    // Flat tasks pagination
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

    // Auto-scroll to today's date when component mounts
    useEffect(() => {
        if (!scrollContainerRef.current) return;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Calculate today's position in the timeline
        const daysFromStart = getDaysBetween(timelineRange.start, today);
        const columnWidth = granularity === 'days' ? 40 : granularity === 'weeks' ? 80 : 120;
        const todayPosition = daysFromStart * columnWidth;

        // Scroll to position today in the center of the viewport
        const containerWidth = scrollContainerRef.current.clientWidth;
        const scrollPosition = Math.max(0, todayPosition - containerWidth / 2 + 200); // 200px offset for task names column

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
        <div className={cn("flex flex-col", className)}>
            {/* Toolbar */}
            <div className="flex items-center justify-between gap-4 mb-4 px-1">
                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={expandAll}
                        className="text-xs"
                    >
                        Expand All
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={collapseAll}
                        className="text-xs"
                    >
                        Collapse All
                    </Button>
                </div>

                <div className="flex items-center gap-2">
                    {showProjectFilter && projects && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm" className="gap-2">
                                    <Folder className="h-4 w-4" />
                                    <span className="max-w-[150px] truncate">
                                        {selectedProjectId
                                            ? projects.find(p => p.id === selectedProjectId)?.name || "Unknown Project"
                                            : "All Projects"}
                                    </span>
                                    <ChevronDown className="h-3 w-3" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-[200px] max-h-[300px] overflow-y-auto">
                                <DropdownMenuItem onClick={() => onProjectChange?.(null)}>
                                    All Projects
                                </DropdownMenuItem>
                                {projects.map(project => (
                                    <DropdownMenuItem
                                        key={project.id}
                                        onClick={() => onProjectChange?.(project.id)}
                                        className="flex items-center gap-2"
                                    >
                                        <div
                                            className="w-2 h-2 rounded-full"
                                            style={{ backgroundColor: project.color || '#666' }}
                                        />
                                        <span className="truncate">{project.name}</span>
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="gap-2">
                                <Calendar className="h-4 w-4" />
                                {granularity === 'days' ? 'Days' : granularity === 'weeks' ? 'Weeks' : 'Months'}
                                <ChevronDown className="h-3 w-3" />
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
                    "max-h-[calc(100vh-280px)] overflow-auto rounded-lg border border-neutral-200 dark:border-neutral-700",
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
                                    <div className="sticky left-0 z-30 w-[200px] min-w-[200px] flex items-center justify-center p-2 bg-white dark:bg-neutral-900 border-b border-r border-neutral-200 dark:border-neutral-700">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="w-full text-xs text-muted-foreground hover:text-foreground"
                                            onClick={handleLoadMoreProjects}
                                        >
                                            Load More Projects
                                        </Button>
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
                                    <div className="sticky left-0 z-30 w-[200px] min-w-[200px] flex items-center justify-center p-2 bg-white dark:bg-neutral-900 border-b border-r border-neutral-200 dark:border-neutral-700">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="w-full text-xs text-muted-foreground hover:text-foreground"
                                            onClick={handleLoadMoreFlat}
                                        >
                                            Load More Tasks
                                        </Button>
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
