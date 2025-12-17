"use client";

import React, { useState, useEffect } from "react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronsDown } from "lucide-react";
import { FlatTaskType } from "@/data/task";
import { ProjectMembersType } from "@/data/project/get-project-members";
import { TaskTableToolbar, ColumnVisibility } from "./task-table-toolbar";
import { TaskRow } from "./task-row";
import { SubTaskList } from "./subtask-list";
import { TaskWithSubTasks } from "./types";
import { useNewTask } from "../shared/task-page-wrapper";
import { toast } from "sonner";
import { useSearchParams } from "next/navigation";
import { getParentTasksOnly, getSubTasks } from "@/data/task";
import { updateSubtaskPositions } from "@/actions/task/gantt";
import { useSubTaskSheet } from "@/contexts/subtask-sheet-context";

interface TaskTableProps {
    initialTasks: TaskWithSubTasks[];
    initialHasMore: boolean;
    initialTotalCount: number;
    members: ProjectMembersType;
    workspaceId: string;
    projectId: string;
    canCreateSubTask: boolean;
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
    workspaceId,
    projectId,
    canCreateSubTask,
}: TaskTableProps) {
    // Task state with pagination
    const [tasks, setTasks] = useState<TaskWithSubTasks[]>(initialTasks);
    const [hasMoreTasks, setHasMoreTasks] = useState(initialHasMore);
    const [currentPage, setCurrentPage] = useState(1);
    const [loadingMoreTasks, setLoadingMoreTasks] = useState(false);
    const { newTask, clearNewTask } = useNewTask();
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
        if (newTask) {
            setTasks(prev => [newTask, ...prev]);
            clearNewTask();
        }
    }, [newTask, clearNewTask]);

    const handleSubTaskUpdated = (taskId: string, subTaskId: string, updatedData: Partial<FlatTaskType>) => {
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

    const handleSubTaskCreated = (taskId: string, newSubTask: any) => {
        setTasks(prevTasks =>
            prevTasks.map(task => {
                if (task.id === taskId) {
                    const currentSubTasks = task.subTasks || [];
                    return {
                        ...task,
                        subTasks: [...currentSubTasks, newSubTask],
                        _count: {
                            ...task._count,
                            subTasks: currentSubTasks.length + 1
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
    const [searchQuery, setSearchQuery] = useState("");
    const [tagFilter, setTagFilter] = useState<string | null>(null);
    const [columnVisibility, setColumnVisibility] = useState<ColumnVisibility>({
        assignee: true,
        startDate: true,
        dueDate: true,
        progress: true,
        status: true,
        tag: true,
        description: true,
    });

    // Use global subtask sheet context
    const { openSubTaskSheet } = useSubTaskSheet();

    const handleSubTaskClick = (subTask: FlatTaskType) => {
        openSubTaskSheet(subTask);
    };

    // Load more parent tasks (10 at a time)
    const loadMoreTasks = async () => {
        if (loadingMoreTasks || !hasMoreTasks) return;

        setLoadingMoreTasks(true);
        try {
            const nextPage = currentPage + 1;

            // Call data layer directly (no wrapper needed)
            const result = await getParentTasksOnly(
                projectId,
                workspaceId,
                nextPage,
                10
            );

            setTasks(prev => [...prev, ...result.tasks as unknown as TaskWithSubTasks[]]);
            setHasMoreTasks(result.hasMore);
            setCurrentPage(nextPage);
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
                    // Call data layer directly (no wrapper needed)
                    const result = await getSubTasks(
                        taskId,
                        workspaceId,
                        projectId,
                        1,
                        10
                    );

                    // Update state with fetched subtasks
                    setTasks((prevTasks) =>
                        prevTasks.map((t) =>
                            t.id === taskId
                                ? {
                                    ...t,
                                    subTasks: result.subTasks as FlatTaskType[],
                                    subTasksHasMore: result.hasMore,
                                    subTasksPage: 1,
                                }
                                : t
                        )
                    );
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

            // Call data layer directly (no wrapper needed)
            const result = await getSubTasks(
                taskId,
                workspaceId,
                projectId,
                nextPage,
                10
            );

            setTasks((prevTasks) =>
                prevTasks.map((t) =>
                    t.id === taskId
                        ? {
                            ...t,
                            subTasks: [...(t.subTasks || []), ...(result.subTasks as FlatTaskType[])],
                            subTasksHasMore: result.hasMore,
                            subTasksPage: nextPage,
                        }
                        : t
                )
            );
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

    // Filter and sort tasks by position
    const filteredTasks = tasks
        .filter((task) => {
            const matchesSearch = task.name.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesTag = !tagFilter || task.tag === tagFilter;
            return matchesSearch && matchesTag;
        })
        .sort((a, b) => {
            // Sort by position, handling null values
            const posA = a.position ?? Number.MAX_SAFE_INTEGER;
            const posB = b.position ?? Number.MAX_SAFE_INTEGER;
            return posA - posB;
        });

    const uniqueTags = Array.from(new Set(tasks.map((t) => t.tag as string).filter(Boolean)));

    return (
        <div className="space-y-4 mt-4">
            <TaskTableToolbar
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                tagFilter={tagFilter}
                setTagFilter={setTagFilter}
                uniqueTags={uniqueTags}
                columnVisibility={columnVisibility}
                setColumnVisibility={setColumnVisibility}
            />

            <div className="rounded-md border">
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                >
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[50px]"></TableHead>
                                <TableHead className="min-w-[250px]">Task Name</TableHead>
                                {columnVisibility.description && <TableHead className="w-[200px]">Description</TableHead>}
                                {columnVisibility.assignee && <TableHead className="w-[200px]">Assignee</TableHead>}
                                {columnVisibility.status && <TableHead className="w-[120px]">Status</TableHead>}
                                {columnVisibility.startDate && <TableHead className="w-[150px]">Start Date</TableHead>}
                                {columnVisibility.dueDate && <TableHead className="w-[150px]">Due Date</TableHead>}
                                {columnVisibility.progress && <TableHead className="w-[120px]">Progress</TableHead>}
                                {columnVisibility.tag && <TableHead className="w-[150px]">Tag</TableHead>}
                                <TableHead className="w-[50px]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
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
                                            members={members}
                                            workspaceId={workspaceId}
                                            projectId={projectId}
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
                                            onSubTaskCreated={(newSubTask) =>
                                                handleSubTaskCreated(task.id, newSubTask)
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
                        </TableBody>
                    </Table>
                </DndContext>
            </div>
        </div>
    );
}
