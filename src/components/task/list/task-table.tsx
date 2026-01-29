"use client";

import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SubTaskList } from "./subtask-list";
import { Button } from "@/components/ui/button";
import React, { useState, useEffect, useMemo, useRef } from "react";
import { ChevronDown, ChevronRight, Folder, Loader2, ArrowUpDown, Filter, X, Plus, ChevronsUpDown, Calendar, LayoutGrid, List as ListIcon, Clock, ChevronsDown, GripVertical, CornerDownRight, Maximize2, Minimize2 } from "lucide-react";
import { loadMoreTasksAction, loadSubTasksAction } from "@/actions/task/list-actions";
import { updateSubtaskPositions } from "@/actions/task/gantt";
import { useSubTaskSheet } from "@/contexts/subtask-sheet-context";
import { TableCell, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ProjectMembersType } from "@/data/project/get-project-members";
import { SubTaskType } from "@/data/task/list/get-subtasks";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { useNewTask } from "@/app/w/[workspaceId]/_components/shared/task-page-wrapper";
import { TaskWithSubTasks } from "@/components/task/shared/types";
import { TaskRow } from "./task-row";
import { TaskFilters } from "../shared/types";
import { GlobalFilterToolbar } from "../shared/global-filter-toolbar";
import { ColumnVisibility } from "../shared/column-visibility";
import { extractAllFilterOptions } from "@/lib/utils/extract-filter-options";
import { InlineTaskForm } from "./inline-task-form";
import { ProjectRow } from "./project-row";
import { UserPermissionsType } from "@/data/user/get-user-permissions";

interface TaskTableProps {
    initialTasks: TaskWithSubTasks[];
    initialHasMore: boolean;
    members: ProjectMembersType;
    assignees?: Array<{ id: string; name: string; surname?: string }>;
    workspaceId: string;
    projectId: string;
    canCreateSubTask: boolean;
    showAdvancedFilters?: boolean;
    tags?: { id: string; name: string; }[];
    projects?: { id: string; name: string; canManageMembers?: boolean; color?: string }[];
    leadProjectIds?: string[];
    isWorkspaceAdmin?: boolean;
    level?: "workspace" | "project";
    permissions?: UserPermissionsType;
    userId?: string;
}

const DEFAULT_TAGS: { id: string; name: string; }[] = [];
const DEFAULT_PROJECTS: { id: string; name: string; }[] = [];

export function TaskTable({
    initialTasks,
    initialHasMore,
    members,
    assignees,
    workspaceId,
    projectId,
    canCreateSubTask,
    showAdvancedFilters = false,
    tags = DEFAULT_TAGS,
    projects = DEFAULT_PROJECTS,
    leadProjectIds = [],
    isWorkspaceAdmin = false,
    level = "project",
    permissions,
    userId,
}: TaskTableProps) {
    const [tasks, setTasks] = useState<TaskWithSubTasks[]>(initialTasks);
    const [hasMoreTasks, setHasMoreTasks] = useState(initialHasMore);
    const [currentPage, setCurrentPage] = useState(1);
    const [loadingMoreTasks, setLoadingMoreTasks] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [filters, setFilters] = useState<TaskFilters>({});
    const [isLoadingFilters, setIsLoadingFilters] = useState(false);
    const { lastEvent, clearEvent } = useNewTask();
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    const [loadingSubTasks, setLoadingSubTasks] = useState<Record<string, boolean>>({});
    const [loadingMoreSubTasks, setLoadingMoreSubTasks] = useState<Record<string, boolean>>({});
    const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
    const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});

    // Auto-expand all projects when groups change
    useEffect(() => {
        if (filters.projectId) return; // If filtered by project, usually just one is shown (or logic differs)
        // logic to expand all by default could be here, but let's do it lazily or init
        // Actually, let's just default to true in the render check if key is missing, or set keys here.
    }, [tasks, level]);

    const toggleProjectExpand = (projectId: string) => {
        setExpandedProjects(prev => ({
            ...prev,
            [projectId]: prev[projectId] === undefined ? true : !prev[projectId] // Default to collapsed, so toggle sets to true
        }));
    };
    const [activeInlineProjectId, setActiveInlineProjectId] = useState<string | null>(null);

    const [filteredProjects, setFilteredProjects] = useState<{ id: string; name: string; }[]>(projects || []);

    useEffect(() => {
        const hasActiveFilters = searchQuery || Object.keys(filters).length > 0;

        if (!hasActiveFilters && projects) {
            setFilteredProjects(projects);
        }

        if (hasActiveFilters) return;

        setTasks(prevTasks => {
            return initialTasks.map((serverTask: TaskWithSubTasks) => {
                const existingTask = prevTasks.find(t => t.id === serverTask.id);
                if (existingTask?.subTasks) {
                    return {
                        ...serverTask,
                        subTasks: existingTask.subTasks,
                        subTasksHasMore: existingTask.subTasksHasMore,
                        subTasksPage: existingTask.subTasksPage,
                    };
                }

                return serverTask;
            });
        });
    }, [initialTasks, searchQuery, filters, projects]);

    useEffect(() => {
        if (lastEvent) {
            if (lastEvent.type === 'ADD' && lastEvent.task) {
                const newTask = lastEvent.task as TaskWithSubTasks;
                setTasks(prev => {
                    if (prev.some(t => t.id === newTask.id)) return prev;
                    return [newTask, ...prev];
                });
            } else if (lastEvent.type === 'UPDATE' && lastEvent.taskId) {
                setTasks(prev => prev.map(t =>
                    t.id === lastEvent.taskId ? { ...t, ...lastEvent.task } as TaskWithSubTasks : t
                ));
            } else if (lastEvent.type === 'REMOVE' && lastEvent.taskId) {
                setTasks(prev => prev.filter(t => t.id !== lastEvent.taskId));
            }
            clearEvent();
        }
    }, [lastEvent, clearEvent]);

    const handleSubTaskUpdated = (taskId: string, subTaskId: string, updatedData: Partial<SubTaskType>) => {
        setTasks(prevTasks =>
            prevTasks.map(task => {
                if (task.id === taskId && task.subTasks) {
                    return {
                        ...task,
                        subTasks: task.subTasks.map((subTask: SubTaskType) =>
                            subTask.id === subTaskId
                                ? { ...subTask, ...updatedData }
                                : subTask
                        ),
                    };
                }
                return task;
            })
        );
    };

    const handleSubTaskDeleted = (taskId: string, subTaskId: string) => {
        setTasks(prevTasks =>
            prevTasks.map(task => {
                if (task.id === taskId && task.subTasks) {
                    const newSubTasks = task.subTasks.filter((subTask: SubTaskType) => subTask.id !== subTaskId);
                    return {
                        ...task,
                        subTasks: newSubTasks,
                        _count: {
                            ...task._count,
                            subTasks: newSubTasks.length
                        },
                    };
                }
                return task;
            })
        );
    };

    const handleSubTaskCreated = (taskId: string, newSubTask: any, tempId?: string) => {
        setTasks(prevTasks =>
            prevTasks.map(task => {
                if (task.id === taskId) {
                    const currentSubTasks = task.subTasks || [];

                    if (tempId) {
                        return {
                            ...task,
                            subTasks: currentSubTasks.map((st: SubTaskType) => st.id === tempId ? newSubTask : st)
                        };
                    }

                    if (currentSubTasks.some((st: SubTaskType) => st.id === newSubTask.id)) {
                        return task;
                    }

                    return {
                        ...task,
                        subTasks: [...currentSubTasks, newSubTask],
                        _count: {
                            ...task._count,
                            subTasks: (task._count?.subTasks || 0) + 1
                        },
                    };
                }
                return task;
            })
        );
    };

    const [columnVisibility, setColumnVisibility] = useState<ColumnVisibility>({
        assignee: true,
        reviewer: true,
        startDate: true,
        dueDate: true,
        progress: true,
        status: true,
        tag: true,
        description: true,
        project: level === "workspace",
    });

    const filterOptions = React.useMemo(() => {
        const options = extractAllFilterOptions(tasks as any, showAdvancedFilters ? 'workspace' : 'project');

        const assigneesForFilter = assignees || members.map(member => ({
            id: member.workspaceMember.user?.id || member.workspaceMember.id,
            name: member.workspaceMember.user.name,
            surname: member.workspaceMember.user.surname || undefined,
        })).sort((a, b) => {
            const nameA = `${a.name} ${a.surname || ''}`.trim();
            const nameB = `${b.name} ${b.surname || ''}`.trim();
            return nameA.localeCompare(nameB);
        });

        return {
            ...options,
            assignees: assigneesForFilter,
            tags: tags,
            projects: filteredProjects,
        };
    }, [tasks, showAdvancedFilters, members, assignees, tags, filteredProjects]);

    const { openSubTaskSheet } = useSubTaskSheet();

    useEffect(() => {
        const hasFilters = searchQuery || Object.keys(filters).length > 0;

        if (!hasFilters) return;

        const timer = setTimeout(async () => {
            setIsLoadingFilters(true);
            try {
                const rawFilters = {
                    ...filters,
                    startDate: filters.startDate ? new Date(filters.startDate) : undefined,
                    endDate: filters.endDate ? new Date(filters.endDate) : undefined,
                    search: searchQuery || undefined
                };

                const filtersToSend: any = {};
                Object.keys(rawFilters).forEach(key => {
                    // @ts-ignore
                    const value = rawFilters[key];
                    if (value !== undefined && value !== null && value !== '') {
                        filtersToSend[key] = value;
                    }
                });

                const response = await loadMoreTasksAction(
                    workspaceId,
                    filtersToSend,
                    1,
                    10
                );

                if (response.success && response.data) {
                    setTasks(response.data.tasks as any);
                    setHasMoreTasks(response.data.hasMore);
                    setCurrentPage(1);

                    const facets = (response.data as any).facets;
                    if (facets?.projects && projects) {
                        const projectIds = Object.keys(facets.projects);
                        const visible = projects.filter(p => projectIds.includes(p.id));
                        setFilteredProjects(visible);
                    }
                } else {
                    toast.error("Failed to apply filters");
                }
            } catch (error) {
                console.error("Error applying filters:", error);
            } finally {
                setIsLoadingFilters(false);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [filters, searchQuery, workspaceId]);

    const handleSubTaskClick = (subTask: SubTaskType) => {
        openSubTaskSheet(subTask);
    };

    const loadMoreTasks = async () => {
        if (loadingMoreTasks || !hasMoreTasks) return;

        setLoadingMoreTasks(true);
        try {
            const nextPage = currentPage + 1;
            const response = await loadMoreTasksAction(
                workspaceId,
                {
                    ...filters,
                    projectId: projectId || filters.projectId,
                    startDate: filters.startDate ? new Date(filters.startDate) : undefined,
                    endDate: filters.endDate ? new Date(filters.endDate) : undefined,
                    search: searchQuery
                },
                nextPage,
                10
            );

            if (response.success && response.data) {
                setTasks(prev => [...prev, ...response.data!.tasks as unknown as TaskWithSubTasks[]]);
                setHasMoreTasks(response.data!.hasMore ?? false);
                setCurrentPage(nextPage);
            } else {
                toast.error(response.error || "Failed to load more tasks");
            }
        } catch (error) {
            console.error("Error loading more tasks:", error);
            toast.error("Failed to load more tasks");
        } finally {
            setLoadingMoreTasks(false);
        }
    };

    /**
     * Toggle task expansion
     * Subtasks are loaded ON-DEMAND only when:
     * 1. User expands a task (not when collapsing)
     * 2. Subtasks haven't been loaded yet
     * This ensures we don't fetch data until it's actually needed
     */
    const toggleExpand = async (taskId: string) => {
        const isCurrentlyExpanded = expanded[taskId];
        setExpanded((prev) => ({ ...prev, [taskId]: !prev[taskId] }));

        if (!isCurrentlyExpanded) {
            const task = tasks.find((t) => t.id === taskId);

            if (task && !task.subTasks) {
                setLoadingSubTasks((prev) => ({ ...prev, [taskId]: true }));

                try {
                    const cleanFilters: any = {};
                    const rawFilters = {
                        ...filters,
                        startDate: filters.startDate ? new Date(filters.startDate) : undefined,
                        endDate: filters.endDate ? new Date(filters.endDate) : undefined,
                        search: searchQuery || undefined
                    };
                    Object.keys(rawFilters).forEach(key => {
                        // @ts-ignore
                        const value = rawFilters[key];
                        if (value !== undefined && value !== null && value !== '') {
                            cleanFilters[key] = value;
                        }
                    });

                    const response = await loadSubTasksAction(
                        taskId,
                        workspaceId,
                        task.projectId || projectId,
                        cleanFilters,
                        1,
                        10
                    );

                    if (response.success && response.data) {
                        setTasks((prevTasks) =>
                            prevTasks.map((t) =>
                                t.id === taskId
                                    ? {
                                        ...t,
                                        subTasks: response.data!.subTasks,
                                        subTasksHasMore: response.data!.hasMore,
                                        subTasksPage: 1,
                                    }
                                    : t
                            )
                        );
                    } else {
                        toast.error(response.error || "Failed to load subtasks");
                    }
                } catch (error) {
                    console.error("Error loading subtasks:", error);
                    toast.error("Failed to load subtasks");
                } finally {
                    setLoadingSubTasks((prev) => ({ ...prev, [taskId]: false }));
                }
            }
        }
    };

    const handleExpandAll = async () => {
        const allExpanded = tasks.reduce((acc, task) => ({
            ...acc,
            [task.id]: true
        }), {});
        setExpanded(allExpanded);

        const tasksNeedingSubtasks = tasks.filter(task => !task.subTasks);

        if (tasksNeedingSubtasks.length > 0) {
            const newLoadingState = tasksNeedingSubtasks.reduce((acc, task) => ({
                ...acc,
                [task.id]: true
            }), {});
            setLoadingSubTasks(prev => ({ ...prev, ...newLoadingState }));

            try {
                await Promise.all(tasksNeedingSubtasks.map(async (task) => {
                    try {
                        const cleanFilters: any = {};
                        const rawFilters = {
                            ...filters,
                            startDate: filters.startDate ? new Date(filters.startDate) : undefined,
                            endDate: filters.endDate ? new Date(filters.endDate) : undefined,
                            search: searchQuery || undefined
                        };
                        Object.keys(rawFilters).forEach(key => {
                            // @ts-ignore
                            const value = rawFilters[key];
                            if (value !== undefined && value !== null && value !== '') {
                                cleanFilters[key] = value;
                            }
                        });

                        const response = await loadSubTasksAction(
                            task.id,
                            workspaceId,
                            task.projectId || projectId, // Use task's projectId if available
                            cleanFilters,
                            1,
                            10
                        );

                        if (response.success && response.data) {
                            setTasks(prevTasks => prevTasks.map(t =>
                                t.id === task.id
                                    ? {
                                        ...t,
                                        subTasks: response.data!.subTasks,
                                        subTasksHasMore: response.data!.hasMore,
                                        subTasksPage: 1
                                    }
                                    : t
                            ));
                        }
                    } catch (err) {
                        console.error(`Failed to load subtasks for task ${task.id}`, err);
                    }
                }));
            } catch (error) {
                console.error("Error expanding all tasks:", error);
                toast.error("Some subtasks failed to load");
            } finally {
                setLoadingSubTasks(prev => {
                    const next = { ...prev };
                    tasksNeedingSubtasks.forEach(t => delete next[t.id]);
                    return next;
                });
            }
        }
    };

    const handleCollapseAll = () => {
        setExpanded({});
    };

    const loadMoreSubTasks = async (taskId: string) => {
        const task = tasks.find((t) => t.id === taskId);
        if (!task || !task.subTasks) return;

        setLoadingMoreSubTasks((prev) => ({ ...prev, [taskId]: true }));

        try {
            const nextPage = (task.subTasksPage || 1) + 1;
            const cleanFilters: any = {};
            const rawFilters = {
                ...filters,
                startDate: filters.startDate ? new Date(filters.startDate) : undefined,
                endDate: filters.endDate ? new Date(filters.endDate) : undefined,
                search: searchQuery || undefined
            };
            Object.keys(rawFilters).forEach(key => {
                // @ts-ignore
                const value = rawFilters[key];
                if (value !== undefined && value !== null && value !== '') {
                    cleanFilters[key] = value;
                }
            });

            const response = await loadSubTasksAction(
                taskId,
                workspaceId,
                task.projectId || projectId,
                cleanFilters,
                nextPage,
                10
            );

            if (response.success && response.data) {
                setTasks((prevTasks) =>
                    prevTasks.map((t) =>
                        t.id === taskId
                            ? {
                                ...t,
                                subTasks: [...(t.subTasks || []), ...response.data!.subTasks],
                                subTasksHasMore: response.data!.hasMore,
                                subTasksPage: nextPage,
                            }
                            : t
                    )
                );
            } else {
                toast.error(response.error || "Failed to load more subtasks");
            }
        } catch (error) {
            console.error("Error loading more subtasks:", error);
            toast.error("Failed to load more subtasks");
        } finally {
            setLoadingMoreSubTasks((prev) => ({ ...prev, [taskId]: false }));
        }
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;

        if (!over || active.id === over.id) return;

        const activeSubTaskId = active.id as string;
        const overSubTaskId = over.id as string;

        const parentTask = tasks.find((task) =>
            task.subTasks?.some((sub: SubTaskType) => sub.id === activeSubTaskId)
        );

        if (!parentTask || !parentTask.subTasks) return;

        const isOverInSameParent = parentTask.subTasks.some(
            (sub: SubTaskType) => sub.id === overSubTaskId
        );

        if (isOverInSameParent) {
            const oldIndex = parentTask.subTasks.findIndex(
                (sub: SubTaskType) => sub.id === activeSubTaskId
            );
            const newIndex = parentTask.subTasks.findIndex(
                (sub: SubTaskType) => sub.id === overSubTaskId
            );
            const newSubTasks = arrayMove(parentTask.subTasks, oldIndex, newIndex) as SubTaskType[];
            const updatedSubTasks = newSubTasks.map((subtask: SubTaskType, index: number) => ({
                ...subtask,
                position: index
            }));
            const newTasks = tasks.map((t) => {
                if (t.id === parentTask.id) {
                    return { ...t, subTasks: updatedSubTasks };
                }
                return t;
            });

            setTasks(newTasks);
            const toastId = toast.loading("Updating subtask order...");

            try {
                const updates = updatedSubTasks.map((subtask, index) => ({
                    subtaskId: subtask.id,
                    newPosition: index
                }));

                const result = await updateSubtaskPositions(
                    parentTask.id,
                    projectId,
                    workspaceId,
                    updates
                );

                if (result.success) {
                    toast.success("Subtask order updated successfully", { id: toastId });
                } else {
                    setTasks(tasks);
                    toast.error(result.message || "Failed to update subtask order", { id: toastId });
                }
            } catch (error) {
                console.error("Error updating subtask positions:", error);
                // Revert on error
                setTasks(tasks);
                toast.error("Failed to update subtask order", { id: toastId });
            }
        }
    };

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    // Helper function to check if any filters are active
    const hasActiveFilters = (filters: TaskFilters): boolean => {
        return !!(
            filters.status ||
            filters.assigneeId ||
            filters.tagId ||
            filters.startDate ||
            filters.endDate ||
            filters.projectId
        );
    };


    // Apply filters to subtasks (not parent tasks)
    // Server-side filtered tasks
    const filteredTasks = tasks;

    // Calculate visible columns count for colSpan: 2 fixed (expand, name) + dynamic + 1 fixed (actions)
    // Exclude 'project' from count as we are removing the column (grouping replaces it)
    const visibleColumnsCount = 2 + Object.entries(columnVisibility).filter(([k, v]) => k !== 'project' && v).length + 1;

    // Group tasks by project for workspace view
    const groupedTasks = useMemo(() => {
        if (level !== "workspace") return null;

        const groups: Record<string, TaskWithSubTasks[]> = {};

        // Initialize with all projects to ensure empty ones are shown
        projects.forEach(project => {
            groups[project.id] = [];
        });

        filteredTasks.forEach((task) => {
            const pId = task.projectId;
            if (!groups[pId]) {
                groups[pId] = [];
            }
            groups[pId].push(task);
        });

        return groups;
    }, [filteredTasks, level, projects]);

    // Infinite Scroll Implementation
    const bottomRef = useRef<HTMLTableRowElement>(null);

    useEffect(() => {
        if (!hasMoreTasks || loadingMoreTasks) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    loadMoreTasks();
                }
            },
            { rootMargin: "100px" }
        );

        const currentRef = bottomRef.current;
        if (currentRef) {
            observer.observe(currentRef);
        }

        return () => {
            if (currentRef) {
                observer.unobserve(currentRef);
            }
        };
    }, [hasMoreTasks, loadingMoreTasks, loadMoreTasks]); // loadMoreTasks creates new reference on render, causing re-subscription, but essential for closure freshness

    return (
        <div className="space-y-4 mt-4">
            <div className="flex items-center gap-2 mb-4">
                <GlobalFilterToolbar
                    className="flex-1"
                    level={showAdvancedFilters ? "workspace" : "project"}
                    view="list"
                    filters={filters}
                    searchQuery={searchQuery}
                    projects={filterOptions.projects}
                    members={filterOptions.assignees}
                    tags={filterOptions.tags}
                    onFilterChange={setFilters}
                    onSearchChange={setSearchQuery}
                    onClearAll={() => {
                        setFilters({});
                        setSearchQuery("");
                    }}
                    columnVisibility={columnVisibility}
                    setColumnVisibility={setColumnVisibility}
                />
            </div>


            <div className="rounded-md border overflow-hidden relative">
                {isLoadingFilters && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/50 backdrop-blur-sm transition-all duration-300">
                        <div className="flex flex-col items-center gap-2">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            <span className="text-sm font-medium text-muted-foreground">Filtering...</span>
                        </div>
                    </div>
                )}
                <div className={cn(
                    "max-h-[calc(100vh-280px)] overflow-auto",
                    // Custom ultra-thin scrollbar
                    "[&::-webkit-scrollbar]:w-0.5",
                    "[&::-webkit-scrollbar-track]:bg-transparent",
                    "[&::-webkit-scrollbar-thumb]:bg-slate-300",
                    "[&::-webkit-scrollbar-thumb]:rounded-full",
                    "[&::-webkit-scrollbar-thumb]:hover:bg-slate-400"
                )}>
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                    >
                        <table className="w-full caption-bottom text-sm table-fixed">
                            <thead className="[&_tr]:border-b">
                                <tr className="sticky top-0 z-10 bg-background border-b shadow-sm hover:bg-muted/50">
                                    <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[50px] bg-background">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-muted">
                                                    <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="start">
                                                <DropdownMenuItem onClick={handleExpandAll}>
                                                    <Maximize2 className="mr-2 h-4 w-4" />
                                                    Expand All
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={handleCollapseAll}>
                                                    <Minimize2 className="mr-2 h-4 w-4" />
                                                    Collapse All
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </th>
                                    <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[250px] bg-background">Task Name</th>
                                    {/* Project column removed (using grouping instead) */}
                                    {columnVisibility.description && <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[200px] bg-background">Description</th>}
                                    {columnVisibility.assignee && <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[100px] bg-background">Assignee</th>}
                                    {columnVisibility.reviewer && <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[100px] bg-background">Reviewer</th>}
                                    {columnVisibility.status && <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[100px] bg-background">Status</th>}
                                    {columnVisibility.startDate && <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[100px] bg-background">Start Date</th>}
                                    {columnVisibility.dueDate && <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[100px] bg-background">Due Date</th>}
                                    {columnVisibility.progress && <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[100px] bg-background">Progress</th>}
                                    {columnVisibility.tag && <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[120px] bg-background">Tag</th>}
                                    <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[50px] bg-background"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {groupedTasks ? (
                                    // Grouped View (Workspace)
                                    Object.entries(groupedTasks).map(([projectId, projectTasks]) => {
                                        const project = projects?.find(p => p.id === projectId);
                                        // Skip unknown project group if empty (optional)
                                        if (projectId === 'unknown' && projectTasks.length === 0) return null;

                                        const isProjectExpanded = expandedProjects[projectId] === true; // Default to collapsed

                                        return (
                                            <React.Fragment key={projectId}>
                                                {/* Project Header Row (Collapsible) */}
                                                <ProjectRow
                                                    project={project || { id: projectId, name: "Unknown Project" }}
                                                    tasksCount={projectTasks.length}
                                                    isExpanded={isProjectExpanded}
                                                    onToggle={() => toggleProjectExpand(projectId)}
                                                    colSpan={visibleColumnsCount}
                                                >

                                                    {/* Tasks in Project */}
                                                    {isProjectExpanded && projectTasks.map((task) => (
                                                        <React.Fragment key={task.id}>
                                                            <TaskRow
                                                                task={task}
                                                                isExpanded={!!expanded[task.id]}
                                                                onToggleExpand={() => toggleExpand(task.id)}
                                                                columnVisibility={columnVisibility}
                                                                isUpdating={updatingTaskId === task.id}
                                                                onUpdateStart={() => setUpdatingTaskId(task.id)}
                                                                onUpdateEnd={() => setUpdatingTaskId(null)}
                                                                onTaskUpdated={(updatedTask) => {
                                                                    setTasks(prevTasks =>
                                                                        prevTasks.map(t =>
                                                                            t.id === task.id
                                                                                ? { ...t, name: updatedTask.name, taskSlug: updatedTask.taskSlug }
                                                                                : t
                                                                        )
                                                                    );
                                                                }}
                                                                onTaskDeleted={(taskId) => {
                                                                    setTasks(prevTasks =>
                                                                        prevTasks.filter(t => t.id !== taskId)
                                                                    );
                                                                }}
                                                                permissions={permissions}
                                                                userId={userId}
                                                                isWorkspaceAdmin={isWorkspaceAdmin}
                                                                leadProjectIds={leadProjectIds}
                                                                projects={projects}
                                                            >
                                                                <SubTaskList
                                                                    task={task}
                                                                    tags={tags}
                                                                    members={members}
                                                                    workspaceId={workspaceId}
                                                                    projectId={task.projectId || projectId}
                                                                    canCreateSubTask={
                                                                        level === 'project'
                                                                            ? canCreateSubTask
                                                                            : (canCreateSubTask && task.projectId ? (
                                                                                leadProjectIds.includes(task.projectId) ||
                                                                                !!isWorkspaceAdmin ||
                                                                                !!projects?.find(p => p.id === task.projectId)?.canManageMembers
                                                                            ) : false)
                                                                    }
                                                                    columnVisibility={columnVisibility}
                                                                    isLoading={!!loadingSubTasks[task.id]}
                                                                    isLoadingMore={!!loadingMoreSubTasks[task.id]}
                                                                    onLoadMore={() => loadMoreSubTasks(task.id)}
                                                                    onSubTaskClick={handleSubTaskClick}
                                                                    onSubTaskUpdated={(subTaskId, updatedData) =>
                                                                        handleSubTaskUpdated(task.id, subTaskId, updatedData)
                                                                    }
                                                                    onSubTaskDeleted={(subTaskId) =>
                                                                        handleSubTaskDeleted(task.id, subTaskId)
                                                                    }
                                                                    onSubTaskCreated={(newSubTask, tempId) =>
                                                                        handleSubTaskCreated(task.id, newSubTask, tempId)
                                                                    }
                                                                    permissions={permissions}
                                                                    userId={userId}
                                                                    isWorkspaceAdmin={isWorkspaceAdmin}
                                                                    leadProjectIds={leadProjectIds}
                                                                    projects={projects}
                                                                    level={level}
                                                                />
                                                            </TaskRow>
                                                        </React.Fragment>
                                                    ))}
                                                    {/* Add Task inside Project Group */}
                                                    {isProjectExpanded && canCreateSubTask && !searchQuery && Object.keys(filters).length === 0 && (
                                                        activeInlineProjectId === projectId ? (
                                                            <InlineTaskForm
                                                                workspaceId={workspaceId}
                                                                projectId={projectId}
                                                                projects={projects}
                                                                level={level}
                                                                leadProjectIds={leadProjectIds}
                                                                isWorkspaceAdmin={isWorkspaceAdmin}
                                                                onCancel={() => setActiveInlineProjectId(null)}
                                                                onTaskDeleted={(taskId) => {
                                                                    setTasks(prev => prev.filter(t => t.id !== taskId));
                                                                }}
                                                                onTaskCreated={(task, tempId) => {
                                                                    if (tempId) {
                                                                        setTasks(prev => prev.map(t => t.id === tempId ? task : t));
                                                                    } else {
                                                                        setTasks(prev => [task, ...prev]);
                                                                    }
                                                                    setActiveInlineProjectId(null);
                                                                }}
                                                            />
                                                        ) : (
                                                            <TableRow
                                                                className="hover:bg-muted/20 cursor-pointer h-8"
                                                                onClick={(e) => { e.stopPropagation(); setActiveInlineProjectId(projectId); }}
                                                            >
                                                                <TableCell colSpan={visibleColumnsCount} className="py-1 px-2 pl-8">
                                                                    <div className="flex items-center gap-2 text-primary font-medium hover:text-primary/80 transition-colors">
                                                                        <Plus className="h-4 w-4" />
                                                                        <span>Add Task</span>
                                                                    </div>
                                                                </TableCell>
                                                            </TableRow>
                                                        )
                                                    )}
                                                </ProjectRow>
                                            </React.Fragment>
                                        );
                                    })
                                ) : (
                                    // Flat View (Original)
                                    filteredTasks.map((task) => (
                                        <React.Fragment key={task.id}>
                                            <TaskRow
                                                task={task}
                                                isExpanded={!!expanded[task.id]}
                                                onToggleExpand={() => toggleExpand(task.id)}
                                                columnVisibility={columnVisibility}
                                                isUpdating={updatingTaskId === task.id}
                                                onUpdateStart={() => setUpdatingTaskId(task.id)}
                                                onUpdateEnd={() => setUpdatingTaskId(null)}
                                                onTaskUpdated={(updatedTask) => {
                                                    setTasks(prevTasks =>
                                                        prevTasks.map(t =>
                                                            t.id === task.id
                                                                ? { ...t, name: updatedTask.name, taskSlug: updatedTask.taskSlug }
                                                                : t
                                                        )
                                                    );
                                                }}
                                                onTaskDeleted={(taskId) => {
                                                    setTasks(prevTasks =>
                                                        prevTasks.filter(t => t.id !== taskId)
                                                    );
                                                }}
                                                permissions={permissions}
                                                userId={userId}
                                                isWorkspaceAdmin={isWorkspaceAdmin}
                                                leadProjectIds={leadProjectIds}
                                                projects={projects}
                                            >
                                                <SubTaskList
                                                    task={task}
                                                    tags={tags}
                                                    members={members}
                                                    workspaceId={workspaceId}
                                                    projectId={task.projectId || projectId}
                                                    canCreateSubTask={
                                                        level === 'project'
                                                            ? canCreateSubTask
                                                            : (canCreateSubTask && task.projectId ? (
                                                                leadProjectIds.includes(task.projectId) ||
                                                                !!isWorkspaceAdmin ||
                                                                !!projects?.find(p => p.id === task.projectId)?.canManageMembers
                                                            ) : false)
                                                    }
                                                    columnVisibility={columnVisibility}
                                                    isLoading={!!loadingSubTasks[task.id]}
                                                    isLoadingMore={!!loadingMoreSubTasks[task.id]}
                                                    onLoadMore={() => loadMoreSubTasks(task.id)}
                                                    onSubTaskClick={handleSubTaskClick}
                                                    onSubTaskUpdated={(subTaskId, updatedData) =>
                                                        handleSubTaskUpdated(task.id, subTaskId, updatedData)
                                                    }
                                                    onSubTaskDeleted={(subTaskId) =>
                                                        handleSubTaskDeleted(task.id, subTaskId)
                                                    }
                                                    onSubTaskCreated={(newSubTask, tempId) =>
                                                        handleSubTaskCreated(task.id, newSubTask, tempId)
                                                    }
                                                    permissions={permissions}
                                                    userId={userId}
                                                    isWorkspaceAdmin={isWorkspaceAdmin}
                                                    leadProjectIds={leadProjectIds}
                                                    projects={projects}
                                                    level={level}
                                                />
                                            </TaskRow>
                                        </React.Fragment>
                                    ))
                                )}

                                {/* Loading indicator when loading subtasks for filters */}
                                {isLoadingFilters && filteredTasks.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={visibleColumnsCount} className="h-32 text-center">
                                            <div className="flex flex-col items-center justify-center gap-2">
                                                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                                                <span className="text-sm text-muted-foreground">Loading tasks...</span>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )}

                                {filteredTasks.length === 0 && !isLoadingFilters && (
                                    <TableRow>
                                        <TableCell colSpan={visibleColumnsCount} className="h-24 text-center">
                                            No tasks found.
                                        </TableCell>
                                    </TableRow>
                                )}

                                {/* Infinite Scroll Trigger / Loader */}
                                {hasMoreTasks && (
                                    <TableRow ref={bottomRef}>
                                        <TableCell colSpan={visibleColumnsCount} className="text-center py-2 h-10">
                                            {loadingMoreTasks && (
                                                <div className="flex items-center justify-center w-full">
                                                    <Loader2 className="h-6 w-6 animate-spin text-primary/50" />
                                                </div>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                )}

                                {/* Add Task - Flat View Only */}
                                {canCreateSubTask && !groupedTasks && !hasActiveFilters(filters) && !searchQuery && (
                                    activeInlineProjectId === projectId ? (
                                        <InlineTaskForm
                                            workspaceId={workspaceId}
                                            projectId={projectId}
                                            projects={projects}
                                            level={level}
                                            leadProjectIds={leadProjectIds}
                                            isWorkspaceAdmin={isWorkspaceAdmin}
                                            onCancel={() => setActiveInlineProjectId(null)}
                                            onTaskDeleted={(taskId) => {
                                                setTasks(prev => prev.filter(t => t.id !== taskId));
                                            }}
                                            onTaskCreated={(task, tempId) => {
                                                if (tempId) {
                                                    setTasks(prev => prev.map(t => t.id === tempId ? task : t));
                                                } else {
                                                    setTasks(prev => [task, ...prev]);
                                                }
                                                setActiveInlineProjectId(null);
                                            }}
                                        />
                                    ) : (
                                        <TableRow className="hover:bg-muted/20 cursor-pointer h-8" onClick={() => setActiveInlineProjectId(projectId)}>
                                            <TableCell colSpan={visibleColumnsCount} className="py-1 px-2 text-muted-foreground">
                                                <div className="flex items-center gap-2 text-primary font-medium hover:text-primary/80">
                                                    <Plus className="h-4 w-4" />
                                                    <span>Add Task</span>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )
                                )}
                            </tbody>
                        </table>
                    </DndContext>
                </div>
            </div>
        </div>
    );
}
