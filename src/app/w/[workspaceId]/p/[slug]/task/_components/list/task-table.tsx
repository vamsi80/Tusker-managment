"use client";

import React, { useState, useEffect } from "react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronsDown } from "lucide-react";

import { ProjectTasksResponse, getProjectTasks, getTaskSubTasks, SubTaskType } from "@/app/data/task/get-project-tasks";
import { ProjectMembersType } from "@/app/data/project/get-project-members";
import { TaskTableToolbar, ColumnVisibility } from "./task-table-toolbar";
import { TaskRow } from "./task-row";
import { SubTaskList } from "./subtask-list";
import { TaskWithSubTasks } from "./types";
import { SubTaskDetailsSheet } from "../shared/subtask-details-sheet";
import { useNewTask } from "../shared/task-page-wrapper";

import { toast } from "sonner";
import { useSearchParams } from "next/navigation";


interface TaskTableProps {
    initialTasksData: ProjectTasksResponse;
    members: ProjectMembersType;
    workspaceId: string;
    projectId: string;
    canCreateSubTask: boolean;
}

/**
 * Main task table component with drag-and-drop, filtering, and pagination
 */
export function TaskTable({
    initialTasksData,
    members,
    workspaceId,
    projectId,
    canCreateSubTask,
}: TaskTableProps) {
    // Task state
    const [tasks, setTasks] = useState<TaskWithSubTasks[]>(initialTasksData.tasks);
    const [currentPage, setCurrentPage] = useState(initialTasksData.currentPage);
    const [hasMoreTasks, setHasMoreTasks] = useState(initialTasksData.hasMore);
    const [loadingMoreTasks, setLoadingMoreTasks] = useState(false);
    const { newTask, clearNewTask } = useNewTask();
    const searchParams = useSearchParams();

    useEffect(() => {
        setTasks(prevTasks => {
            return initialTasksData.tasks.map(serverTask => {
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
        setCurrentPage(initialTasksData.currentPage);
        setHasMoreTasks(initialTasksData.hasMore);
    }, [initialTasksData]);

    useEffect(() => {
        if (newTask) {
            setTasks(prev => [newTask, ...prev]);
            clearNewTask();
        }
    }, [newTask, clearNewTask]);

    const handleSubTaskUpdated = (taskId: string, subTaskId: string, updatedData: Partial<SubTaskType[number]>) => {
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
                        _count: { subTasks: newSubTasks.length },
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
                        _count: { subTasks: currentSubTasks.length + 1 },
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

    const [selectedSubTask, setSelectedSubTask] = useState<SubTaskType[number] | null>(null);
    const [isSheetOpen, setIsSheetOpen] = useState(false);

    // Handle URL-based subtask opening
    useEffect(() => {
        const subtaskId = searchParams.get('subtask');
        if (subtaskId && tasks.length > 0) {
            // Find the subtask in all tasks
            for (const task of tasks) {
                if (task.subTasks) {
                    const foundSubTask = task.subTasks.find(st => st.id === subtaskId);
                    if (foundSubTask) {
                        setSelectedSubTask(foundSubTask);
                        setIsSheetOpen(true);
                        // Expand the parent task if not already expanded
                        if (!expanded[task.id]) {
                            setExpanded(prev => ({ ...prev, [task.id]: true }));
                        }
                        break;
                    }
                }
            }
        }
    }, [searchParams, tasks]);

    const handleSubTaskClick = (subTask: SubTaskType[number]) => {
        setSelectedSubTask(subTask);
        setIsSheetOpen(true);
    };

    const handleCloseSheet = () => {
        setIsSheetOpen(false);
        setTimeout(() => setSelectedSubTask(null), 300);
    };

    const loadMoreTasks = async () => {
        setLoadingMoreTasks(true);
        try {
            const nextPage = currentPage + 1;
            const result = await getProjectTasks(projectId, workspaceId, nextPage, 10);

            setTasks((prev) => [...prev, ...result.tasks]);
            setCurrentPage(nextPage);
            setHasMoreTasks(result.hasMore);
        } catch (error) {
            console.error("Error loading more tasks:", error);
        } finally {
            setLoadingMoreTasks(false);
        }
    };

    const toggleExpand = async (taskId: string) => {
        const isCurrentlyExpanded = expanded[taskId];
        setExpanded((prev) => ({ ...prev, [taskId]: !prev[taskId] }));

        if (!isCurrentlyExpanded) {
            const task = tasks.find((t) => t.id === taskId);
            if (task && !task.subTasks) {
                setLoadingSubTasks((prev) => ({ ...prev, [taskId]: true }));

                try {
                    const result = await getTaskSubTasks(taskId, workspaceId, projectId, 1, 10);
                    setTasks((prevTasks) =>
                        prevTasks.map((t) =>
                            t.id === taskId
                                ? {
                                    ...t,
                                    subTasks: result.subTasks,
                                    subTasksHasMore: result.hasMore,
                                    subTasksPage: 1,
                                }
                                : t
                        )
                    );
                } catch (error) {
                    console.error("Error loading subtasks:", error);
                } finally {
                    setLoadingSubTasks((prev) => ({ ...prev, [taskId]: false }));
                }
            }
        }
    };

    const loadMoreSubTasks = async (taskId: string) => {
        const task = tasks.find((t) => t.id === taskId);
        if (!task || !task.subTasks) return;

        setLoadingMoreSubTasks((prev) => ({ ...prev, [taskId]: true }));

        try {
            const nextPage = (task.subTasksPage || 1) + 1;
            const result = await getTaskSubTasks(taskId, workspaceId, projectId, nextPage, 10);

            setTasks((prevTasks) =>
                prevTasks.map((t) =>
                    t.id === taskId
                        ? {
                            ...t,
                            subTasks: [...(t.subTasks || []), ...result.subTasks],
                            subTasksHasMore: result.hasMore,
                            subTasksPage: nextPage,
                        }
                        : t
                )
            );
        } catch (error) {
            console.error("Error loading more subtasks:", error);
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
                const { updateSubtaskPositions } = await import("../gantt/actions");
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
                                {columnVisibility.startDate && <TableHead className="w-[150px]">Start Date</TableHead>}
                                {columnVisibility.dueDate && <TableHead className="w-[150px]">Due Date</TableHead>}
                                {columnVisibility.progress && <TableHead className="w-[120px]">Progress</TableHead>}
                                {columnVisibility.status && <TableHead className="w-[120px]">Status</TableHead>}
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

            <SubTaskDetailsSheet
                subTask={selectedSubTask}
                isOpen={isSheetOpen}
                onClose={handleCloseSheet}
            />
        </div>
    );
}
