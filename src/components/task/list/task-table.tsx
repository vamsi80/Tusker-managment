"use client";

import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SubTaskList } from "./subtask-list";
import { Button } from "@/components/ui/button";
import React, { useState, useEffect } from "react";
import { Loader2, ChevronsDown, Plus } from "lucide-react";
import { loadMoreTasksAction, loadSubTasksAction } from "@/actions/task/list-actions";
import { updateSubtaskPositions } from "@/actions/task/gantt";
import { useSubTaskSheet } from "@/contexts/subtask-sheet-context";
import { TableCell, TableRow } from "@/components/ui/table";
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
    const { lastEvent, clearEvent } = useNewTask();

    useEffect(() => {
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
    }, [initialTasks]);

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
                        subTasks: task.subTasks.map(subTask =>
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
                    const newSubTasks = task.subTasks.filter(subTask => subTask.id !== subTaskId);
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
                            subTasks: currentSubTasks.map(st => st.id === tempId ? newSubTask : st)
                        };
                    }

                    // 2. Safety: Check if this real task already exists (e.g. from server refresh)
                    if (currentSubTasks.some(st => st.id === newSubTask.id)) {
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

    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    const [loadingSubTasks, setLoadingSubTasks] = useState<Record<string, boolean>>({});
    const [loadingMoreSubTasks, setLoadingMoreSubTasks] = useState<Record<string, boolean>>({});
    const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
    const [showInlineTaskForm, setShowInlineTaskForm] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [filters, setFilters] = useState<TaskFilters>({});
    const [columnVisibility, setColumnVisibility] = useState<ColumnVisibility>({
        assignee: true,
        startDate: true,
        dueDate: true,
        progress: true,
        status: true,
        tag: true,
        description: true,
    });

    // Extract filter options dynamically from tasks
    const filterOptions = React.useMemo(() => {
        const options = extractAllFilterOptions(tasks as any, showAdvancedFilters ? 'workspace' : 'project');

        // Use pre-extracted assignees if provided (from getAllTasksFlat),
        // otherwise convert members to assignee format
        const assigneesForFilter = assignees || members.map(member => ({
            id: member.workspaceMember.userId,
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
        };
    }, [tasks, showAdvancedFilters, members, assignees]);

    // Use global subtask sheet context
    const { openSubTaskSheet } = useSubTaskSheet();

    // Automatically load subtasks when ANY filter is applied
    useEffect(() => {
        const hasAnyFilter = filters.assigneeId || filters.status || filters.tag || filters.startDate || filters.endDate;

        if (hasAnyFilter) {
            // Load subtasks for all parent tasks that don't have them loaded yet
            tasks.forEach(async (task) => {
                if (!task.subTasks || task.subTasks.length === 0) {
                    try {
                        const response = await loadSubTasksAction(task.id, workspaceId, projectId, 1, 100);
                        if (response.success && response.data && response.data.subTasks.length > 0) {
                            setTasks(prev => prev.map(t =>
                                t.id === task.id
                                    ? {
                                        ...t,
                                        subTasks: response.data!.subTasks as any,
                                        subTasksHasMore: response.data!.hasMore,
                                        subTasksPage: 1
                                    }
                                    : t
                            ));
                        }
                    } catch (error) {
                        console.error('Error loading subtasks for filter:', error);
                    }
                }
            });
        }
    }, [filters.assigneeId, filters.status, filters.tag, filters.startDate, filters.endDate, workspaceId, projectId]);

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
            const response = await loadMoreTasksAction(
                workspaceId,
                { projectId }, // Filter by project
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
                    // Use the server action wrapper instead of direct data call
                    const response = await loadSubTasksAction(
                        taskId,
                        workspaceId,
                        task.projectId || projectId, // Use task's projectId if available, fallback to prop
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

    const loadMoreSubTasks = async (taskId: string) => {
        const task = tasks.find((t) => t.id === taskId);
        if (!task || !task.subTasks) return;

        setLoadingMoreSubTasks((prev) => ({ ...prev, [taskId]: true }));

        try {
            const nextPage = (task.subTasksPage || 1) + 1;

            // Use the server action wrapper instead of direct data call
            const response = await loadSubTasksAction(
                taskId,
                workspaceId,
                task.projectId || projectId, // Use task's projectId if available, fallback to prop
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
            task.subTasks?.some((sub) => sub.id === activeSubTaskId)
        );

        if (!parentTask || !parentTask.subTasks) return;

        const isOverInSameParent = parentTask.subTasks.some(
            (sub) => sub.id === overSubTaskId
        );

        if (isOverInSameParent) {
            const oldIndex = parentTask.subTasks.findIndex(
                (sub) => sub.id === activeSubTaskId
            );
            const newIndex = parentTask.subTasks.findIndex(
                (sub) => sub.id === overSubTaskId
            );

            // Reorder the subtasks array
            const newSubTasks = arrayMove(parentTask.subTasks, oldIndex, newIndex);

            // Update position values based on new order
            const updatedSubTasks = newSubTasks.map((subtask, index) => ({
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
    const filteredTasks = React.useMemo(() => {
        // If no filters are active, return all tasks
        if (!searchQuery && !hasActiveFilters(filters)) {
            return tasks;
        }

        // Filter subtasks and show parent tasks that have matching subtasks
        return tasks.map((task: TaskWithSubTasks) => {
            // If task has no subtasks, skip filtering
            if (!task.subTasks || task.subTasks.length === 0) {
                return task;
            }

            // Filter subtasks
            let filteredSubTasks = task.subTasks;

            // Apply search filter to subtasks
            if (searchQuery) {
                const query = searchQuery.toLowerCase();
                filteredSubTasks = filteredSubTasks.filter((subTask: SubTaskType) =>
                    subTask.name.toLowerCase().includes(query) ||
                    subTask.description?.toLowerCase().includes(query) ||
                    subTask.taskSlug?.toLowerCase().includes(query)
                );
            }

            // Apply status filter to subtasks
            if (filters.status) {
                filteredSubTasks = filteredSubTasks.filter((subTask: SubTaskType) =>
                    subTask.status === filters.status
                );
            }

            // Apply assignee filter to subtasks
            if (filters.assigneeId) {
                filteredSubTasks = filteredSubTasks.filter((subTask: SubTaskType) => {
                    return subTask.assignee?.id === filters.assigneeId;
                });
            }

            // Apply tag filter to subtasks
            if (filters.tag) {
                filteredSubTasks = filteredSubTasks.filter((subTask: SubTaskType) => {
                    // subTask.tag is the tagId (string | null)
                    const tagId = typeof subTask.tag === 'string' ? subTask.tag : (subTask.tag as any)?.id;
                    return tagId === filters.tag;
                });
            }

            // Apply date range filter to subtasks
            if (filters.startDate) {
                filteredSubTasks = filteredSubTasks.filter((subTask: SubTaskType) =>
                    subTask.startDate && new Date(subTask.startDate) >= new Date(filters.startDate!)
                );
            }

            if (filters.endDate) {
                filteredSubTasks = filteredSubTasks.filter((subTask: SubTaskType) => {
                    const dueDate = calculateDueDate(subTask.startDate, subTask.days);
                    if (!dueDate) return false;
                    return dueDate <= new Date(filters.endDate!);
                });
            }

            // Return task with filtered subtasks
            return {
                ...task,
                subTasks: filteredSubTasks,
            };
        }).filter(task => {
            // When ANY filter is active, only show parent tasks that have matching subtasks
            const hasAnyFilter = filters.assigneeId || filters.status || filters.tag || filters.startDate || filters.endDate;

            if (hasAnyFilter) {
                return task.subTasks && task.subTasks.length > 0;
            }

            // When no filters, show parent tasks that have matching subtasks
            // OR tasks that don't have subtasks loaded yet
            return !task.subTasks || task.subTasks.length > 0;
        });
    }, [tasks, searchQuery, filters]);

    return (
        <div className="space-y-4 mt-4">
            <GlobalFilterToolbar
                level={showAdvancedFilters ? "workspace" : "project"}
                view="list"
                filters={filters}
                searchQuery={searchQuery}
                projects={filterOptions.projects}
                members={filterOptions.assignees}
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
                                    <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[50px] bg-background"></th>
                                    <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap min-w-[250px] bg-background">Task Name</th>
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
                                {filteredTasks.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={9} className="h-24 text-center">
                                            No tasks found.
                                        </TableCell>
                                    </TableRow>
                                )}

                                {/* Load More Parent Tasks */}
                                {hasMoreTasks && (
                                    <TableRow>
                                        <TableCell colSpan={9} className="text-center p-4">
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
                                            <TableCell colSpan={9} className="p-3 text-muted-foreground">
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
