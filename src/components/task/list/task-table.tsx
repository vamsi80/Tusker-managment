"use client";

import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SubTaskList } from "./subtask-list";
import { Button } from "@/components/ui/button";
import React, { useState, useEffect } from "react";
import { Loader2, ChevronsDown, Plus, ChevronsUpDown, Maximize2, Minimize2 } from "lucide-react";
import { loadMoreTasksAction, loadSubTasksAction } from "@/actions/task/list-actions";
import { updateSubtaskPositions } from "@/actions/task/gantt";
import { useSubTaskSheet } from "@/contexts/subtask-sheet-context";
import { TableCell, TableRow } from "@/components/ui/table";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { calculateDueDate } from "@/hooks/use-due-date";
import { InlineTaskForm } from "./inline-task-form";

interface TaskTableProps {
    initialTasks: TaskWithSubTasks[];
    initialHasMore: boolean;
    initialTotalCount: number;
    members: ProjectMembersType;
    assignees?: Array<{ id: string; name: string; surname?: string }>; // Optional pre-extracted assignees
    workspaceId: string;
    projectId: string;
    canCreateSubTask: boolean;
    showAdvancedFilters?: boolean;
    tags?: { id: string; name: string; }[]; // Dynamic tags
    projects?: { id: string; name: string; }[];
    level?: "workspace" | "project";
}

/**
 * Main task table component with drag-and-drop and filtering
 * Supports pagination for both parent tasks and subtasks
 */
export function TaskTable({
    initialTasks,
    initialHasMore,
    initialTotalCount,
    members,
    assignees,
    workspaceId,
    projectId,
    canCreateSubTask,
    showAdvancedFilters = false,
    tags = [], // Default to empty array
    projects = [],
    level = "project",
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
    const [showInlineTaskForm, setShowInlineTaskForm] = useState(false);

    // State for dynamic project filtering based on facets
    const [filteredProjects, setFilteredProjects] = useState<{ id: string; name: string; }[]>(projects || []);

    useEffect(() => {
        const hasActiveFilters = searchQuery || Object.keys(filters).length > 0;

        // Reset projects if no filters are active
        if (!hasActiveFilters && projects) {
            setFilteredProjects(projects);
        }

        // Don't sync if filters are active - filter effect handles task updates
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
                    // Prevent duplicates if possible, though optimistic logic usually handles IDs
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

                    // 1. If we have a tempId, replace the optimistic item
                    if (tempId) {
                        return {
                            ...task,
                            subTasks: currentSubTasks.map((st: SubTaskType) => st.id === tempId ? newSubTask : st)
                        };
                    }

                    // 2. Safety: Check if this real task already exists (e.g. from server refresh)
                    if (currentSubTasks.some((st: SubTaskType) => st.id === newSubTask.id)) {
                        return task;
                    }

                    // 3. Otherwise add it as new
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
        startDate: true,
        dueDate: true,
        progress: true,
        status: true,
        tag: true,
        description: true,
        project: level === "workspace", // Show project column only in workspace view
    });

    // Extract filter options dynamically from tasks
    const filterOptions = React.useMemo(() => {
        const options = extractAllFilterOptions(tasks as any, showAdvancedFilters ? 'workspace' : 'project');

        // Use pre-extracted assignees if provided (from getAllTasksFlat),
        // otherwise convert members to assignee format
        const assigneesForFilter = assignees || members.map(member => ({
            id: member.workspaceMember.user?.id || member.workspaceMember.id, // Use user ID first, fallback to member ID if needed
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
            // Use tags from props instead of extracting from tasks
            tags: tags,
            // Use dynamic projects derived from facets (or fallback to all)
            projects: filteredProjects,
        };
    }, [tasks, showAdvancedFilters, members, assignees, tags, filteredProjects]);

    // Use global subtask sheet context
    const { openSubTaskSheet } = useSubTaskSheet();

    // Server-side filtering - only run when filters or search actually change
    useEffect(() => {
        const hasFilters = searchQuery || Object.keys(filters).length > 0;

        // Only run if there are active filters or search
        if (!hasFilters) return;

        const timer = setTimeout(async () => {
            setIsLoadingFilters(true);
            try {
                // Fetch Page 1 with filters
                // Clean filters to remove undefined values before serialization
                // Next.js Server Actions can have issues with undefined values or complex objects
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
                    // Only include defined values
                    if (value !== undefined && value !== null && value !== '') {
                        filtersToSend[key] = value;
                    }
                });

                console.log('🔍 [FRONTEND] Sending CLEAN filters:', filtersToSend);

                const response = await loadMoreTasksAction(
                    workspaceId,
                    filtersToSend,
                    1,
                    10
                );

                if (response.success && response.data) {
                    // Reset tasks list
                    setTasks(response.data.tasks as any);
                    setHasMoreTasks(response.data.hasMore);
                    setCurrentPage(1);

                    // Update dynamic projects based on facets
                    // This enables "Faceted Search" - e.g. selecting an Assignee limits the Project dropdown to only their projects
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

    // Load more parent tasks (10 at a time) - using workspace query with project filter
    const loadMoreTasks = async () => {
        if (loadingMoreTasks || !hasMoreTasks) return;

        setLoadingMoreTasks(true);
        try {
            const nextPage = currentPage + 1;

            // Use the server action wrapper instead of direct data call
            // Use current filters to maintain filter state during pagination
            const response = await loadMoreTasksAction(
                workspaceId,
                {
                    ...filters,
                    projectId: projectId || filters.projectId, // Use projectId prop or filter
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

        // Only fetch subtasks when expanding (not collapsing)
        if (!isCurrentlyExpanded) {
            const task = tasks.find((t) => t.id === taskId);

            // Only fetch if subtasks haven't been loaded yet
            if (task && !task.subTasks) {
                setLoadingSubTasks((prev) => ({ ...prev, [taskId]: true }));

                try {
                    // Clean filters before passing to ensure serialization works
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

                    // Use the server action wrapper instead of direct data call
                    const response = await loadSubTasksAction(
                        taskId,
                        workspaceId,
                        task.projectId || projectId, // Use task's projectId if available, fallback to prop
                        cleanFilters,
                        1,
                        10
                    );

                    if (response.success && response.data) {
                        // Update state with fetched subtasks
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
            // If subtasks already exist, just expand (no fetch needed)
        }
        // If collapsing, just toggle the UI (no fetch needed)
    };

    const handleExpandAll = async () => {
        // 1. Mark all tasks as expanded immediately
        const allExpanded = tasks.reduce((acc, task) => ({
            ...acc,
            [task.id]: true
        }), {});
        setExpanded(allExpanded);

        // 2. Identify tasks that need subtasks loaded
        const tasksNeedingSubtasks = tasks.filter(task => !task.subTasks);

        if (tasksNeedingSubtasks.length > 0) {
            // Set loading state for these tasks
            const newLoadingState = tasksNeedingSubtasks.reduce((acc, task) => ({
                ...acc,
                [task.id]: true
            }), {});
            setLoadingSubTasks(prev => ({ ...prev, ...newLoadingState }));

            try {
                // Load subtasks in parallel
                await Promise.all(tasksNeedingSubtasks.map(async (task) => {
                    try {
                        // Clean filters
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

            // Clean filters
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

            // Use the server action wrapper instead of direct data call
            const response = await loadSubTasksAction(
                taskId,
                workspaceId,
                task.projectId || projectId, // Use task's projectId if available, fallback to prop
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

            // Reorder the subtasks array
            const newSubTasks = arrayMove(parentTask.subTasks, oldIndex, newIndex) as SubTaskType[];

            // Update position values based on new order
            const updatedSubTasks = newSubTasks.map((subtask: SubTaskType, index: number) => ({
                ...subtask,
                position: index
            }));

            // Optimistically update the UI
            const newTasks = tasks.map((t) => {
                if (t.id === parentTask.id) {
                    return { ...t, subTasks: updatedSubTasks };
                }
                return t;
            });

            setTasks(newTasks);

            // Show loading toast
            const toastId = toast.loading("Updating subtask order...");

            // Persist to database
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
                    // Revert on failure
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
            filters.tag ||
            filters.startDate ||
            filters.endDate ||
            filters.projectId
        );
    };


    // Apply filters to subtasks (not parent tasks)
    // Server-side filtered tasks
    const filteredTasks = tasks;

    // Calculate visible columns count for colSpan: 2 fixed (expand, name) + dynamic + 1 fixed (actions)
    const visibleColumnsCount = 2 + Object.values(columnVisibility).filter(Boolean).length + 1;

    return (
        <div className="space-y-4 mt-4">
            <GlobalFilterToolbar
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


            <div className="rounded-md border overflow-hidden">
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
                        <table className="w-full caption-bottom text-sm">
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
                                    <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap min-w-[250px] bg-background">Task Name</th>
                                    {columnVisibility.project && <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[180px] bg-background">Project</th>}
                                    {columnVisibility.description && <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[200px] bg-background">Description</th>}
                                    {columnVisibility.assignee && <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[200px] bg-background">Assignee</th>}
                                    {columnVisibility.status && <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[120px] bg-background">Status</th>}
                                    {columnVisibility.startDate && <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[150px] bg-background">Start Date</th>}
                                    {columnVisibility.dueDate && <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[150px] bg-background">Due Date</th>}
                                    {columnVisibility.progress && <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[120px] bg-background">Progress</th>}
                                    {columnVisibility.tag && <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[150px] bg-background">Tag</th>}
                                    <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[50px] bg-background"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredTasks.map((task) => (
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
                                        />
                                        {expanded[task.id] && (
                                            <SubTaskList
                                                task={task}
                                                tags={tags}
                                                members={members}
                                                workspaceId={workspaceId}
                                                projectId={task.projectId || projectId}
                                                canCreateSubTask={canCreateSubTask}
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
                                            />
                                        )}
                                    </React.Fragment>
                                ))}

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

                                {/* Load More Parent Tasks */}
                                {hasMoreTasks && (
                                    <TableRow>
                                        <TableCell colSpan={visibleColumnsCount} className="text-center p-4">
                                            <Button
                                                variant="outline"
                                                onClick={loadMoreTasks}
                                                disabled={loadingMoreTasks}
                                                className="w-full"
                                            >
                                                {loadingMoreTasks ? (
                                                    <>
                                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                        Loading more tasks...
                                                    </>
                                                ) : (
                                                    <>
                                                        <ChevronsDown className="mr-2 h-4 w-4" />
                                                        Load More Tasks
                                                    </>
                                                )}
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                )}

                                {/* Add Task - Inline Form or Button */}
                                {!hasActiveFilters(filters) && !searchQuery && (
                                    showInlineTaskForm ? (
                                        <InlineTaskForm
                                            workspaceId={workspaceId}
                                            projectId={projectId}
                                            projects={projects}
                                            level={level}
                                            onCancel={() => setShowInlineTaskForm(false)}
                                            onTaskDeleted={(taskId) => {
                                                setTasks(prev => prev.filter(t => t.id !== taskId));
                                            }}
                                            onTaskCreated={(task, tempId) => {
                                                if (tempId) {
                                                    setTasks(prev => prev.map(t => t.id === tempId ? task : t));
                                                } else {
                                                    setTasks(prev => [task, ...prev]);
                                                }
                                                setShowInlineTaskForm(false);
                                            }}
                                        />
                                    ) : (
                                        <TableRow className="hover:bg-muted/20 cursor-pointer" onClick={() => setShowInlineTaskForm(true)}>
                                            <TableCell colSpan={visibleColumnsCount} className="p-3 text-muted-foreground">
                                                <div className="flex items-center gap-2">
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
