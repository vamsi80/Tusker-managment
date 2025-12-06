"use client";

import React, { useState, useEffect } from "react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronsDown, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { ProjectTasksResponse, getProjectTasks, getTaskSubTasks, SubTaskType } from "@/app/data/task/get-project-tasks";
import { ProjectMembersType } from "@/app/data/project/get-project-members";
import { TaskTableToolbar, ColumnVisibility } from "./table/task-table-toolbar";
import { TaskRow } from "./table/task-row";
import { SubTaskList } from "./table/subtask-list";
import { TaskWithSubTasks } from "./table/types";
import { SubTaskDetailsSheet } from "./subtask-details-sheet";
import { useNewTask } from "./task-page-wrapper";
import { bulkDeleteTasks, bulkDeleteSubTasks } from "../action";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { BulkDeleteDialog } from "./bulk-delete-dialog";

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
    const router = useRouter();


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
        tag: true,
        description: true,
    });

    const [selectedSubTask, setSelectedSubTask] = useState<SubTaskType[number] | null>(null);
    const [isSheetOpen, setIsSheetOpen] = useState(false);

    // Bulk selection state
    const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
    const [selectedSubTasks, setSelectedSubTasks] = useState<Set<string>>(new Set());
    const [isDeletingBulk, setIsDeletingBulk] = useState(false);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);


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
            const result = await getProjectTasks(projectId, nextPage, 10);

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
                    const result = await getTaskSubTasks(taskId, 1, 10);
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
            const result = await getTaskSubTasks(taskId, nextPage, 10);

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

    const handleDragEnd = (event: DragEndEvent) => {
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

            const newSubTasks = arrayMove(parentTask.subTasks, oldIndex, newIndex);
            const newTasks = tasks.map((t) => {
                if (t.id === parentTask.id) {
                    return { ...t, subTasks: newSubTasks };
                }
                return t;
            });

            setTasks(newTasks);
            // TODO: Call server action to save new order
        }
    };

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    // Filter tasks
    const filteredTasks = tasks.filter((task) => {
        const matchesSearch = task.name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesTag = !tagFilter || task.tag === tagFilter;
        return matchesSearch && matchesTag;
    });

    const uniqueTags = Array.from(new Set(tasks.map((t) => t.tag as string).filter(Boolean)));

    // Bulk selection handlers
    const handleSelectAllTasks = (checked: boolean) => {
        if (checked) {
            setSelectedTasks(new Set(filteredTasks.map(t => t.id)));
        } else {
            setSelectedTasks(new Set());
        }
    };

    const handleSelectTask = (taskId: string, checked: boolean) => {
        const newSelected = new Set(selectedTasks);
        if (checked) {
            newSelected.add(taskId);
        } else {
            newSelected.delete(taskId);
        }
        setSelectedTasks(newSelected);
    };

    const handleSelectSubTask = (subTaskId: string, checked: boolean) => {
        const newSelected = new Set(selectedSubTasks);
        if (checked) {
            newSelected.add(subTaskId);
        } else {
            newSelected.delete(subTaskId);
        }
        setSelectedSubTasks(newSelected);
    };

    const handleBulkDelete = () => {
        if (selectedTasks.size === 0 && selectedSubTasks.size === 0) return;
        setShowDeleteDialog(true);
    };

    const confirmBulkDelete = async () => {
        const taskCount = selectedTasks.size;
        const subtaskCount = selectedSubTasks.size;

        setIsDeletingBulk(true);

        try {
            let tasksDeleted = false;
            let subtasksDeleted = false;

            // Delete tasks
            if (selectedTasks.size > 0) {
                // Optimistic update
                setTasks(prevTasks => prevTasks.filter(t => !selectedTasks.has(t.id)));

                const result = await bulkDeleteTasks({
                    taskIds: Array.from(selectedTasks),
                    projectId: projectId,
                });

                if (result.status === "success") {
                    tasksDeleted = true;
                } else {
                    toast.error(result.message || "Failed to delete tasks");
                    // Revert optimistic update by refreshing
                    router.refresh();
                    setShowDeleteDialog(false);
                    return;
                }
            }

            // Delete subtasks
            if (selectedSubTasks.size > 0) {
                // Optimistic update
                setTasks(prevTasks =>
                    prevTasks.map(task => {
                        if (task.subTasks) {
                            const newSubTasks = task.subTasks.filter(st => !selectedSubTasks.has(st.id));
                            return {
                                ...task,
                                subTasks: newSubTasks,
                                _count: { subTasks: newSubTasks.length },
                            };
                        }
                        return task;
                    })
                );

                const result = await bulkDeleteSubTasks({
                    subTaskIds: Array.from(selectedSubTasks),
                    projectId: projectId,
                });

                if (result.status === "success") {
                    subtasksDeleted = true;
                } else {
                    toast.error(result.message || "Failed to delete subtasks");
                    // Revert optimistic update by refreshing
                    router.refresh();
                    setShowDeleteDialog(false);
                    return;
                }
            }

            // Clear selections
            setSelectedTasks(new Set());
            setSelectedSubTasks(new Set());

            // Show success message
            const messages = [];
            if (tasksDeleted) messages.push(`${taskCount} task(s)`);
            if (subtasksDeleted) messages.push(`${subtaskCount} subtask(s)`);
            toast.success(`Successfully deleted ${messages.join(" and ")}`);

            // Close dialog
            setShowDeleteDialog(false);

            // Refresh to get updated data from server
            router.refresh();

        } catch (error) {
            console.error("Error deleting items:", error);
            toast.error("An unexpected error occurred. Please try again.");
            // Refresh to restore correct state
            router.refresh();
            setShowDeleteDialog(false);
        } finally {
            setIsDeletingBulk(false);
        }
    };

    const totalSelected = selectedTasks.size + selectedSubTasks.size;
    const allTasksSelected = filteredTasks.length > 0 && selectedTasks.size === filteredTasks.length;

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

            {/* Bulk Delete Toolbar */}
            {totalSelected > 0 && (
                <div className="flex items-center justify-between p-3 bg-muted rounded-md border">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                            {totalSelected} item{totalSelected !== 1 ? 's' : ''} selected
                        </span>
                        {selectedTasks.size > 0 && (
                            <span className="text-xs text-muted-foreground">
                                ({selectedTasks.size} task{selectedTasks.size !== 1 ? 's' : ''})
                            </span>
                        )}
                        {selectedSubTasks.size > 0 && (
                            <span className="text-xs text-muted-foreground">
                                ({selectedSubTasks.size} subtask{selectedSubTasks.size !== 1 ? 's' : ''})
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                setSelectedTasks(new Set());
                                setSelectedSubTasks(new Set());
                            }}
                        >
                            Clear Selection
                        </Button>
                        <Button
                            variant="destructive"
                            size="sm"
                            onClick={handleBulkDelete}
                            disabled={isDeletingBulk}
                        >
                            {isDeletingBulk ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Deleting...
                                </>
                            ) : (
                                <>
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete Selected
                                </>
                            )}
                        </Button>
                    </div>
                </div>
            )}

            <div className="rounded-md border">
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                >
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[50px]">
                                    <Checkbox
                                        checked={allTasksSelected}
                                        onCheckedChange={handleSelectAllTasks}
                                        aria-label="Select all tasks"
                                    />
                                </TableHead>
                                <TableHead className="w-[50px]"></TableHead>
                                <TableHead className="min-w-[250px]">Task Name</TableHead>
                                {columnVisibility.description && <TableHead className="w-[200px]">Description</TableHead>}
                                {columnVisibility.assignee && <TableHead className="w-[200px]">Assignee</TableHead>}
                                {columnVisibility.startDate && <TableHead className="w-[150px]">Start Date</TableHead>}
                                {columnVisibility.dueDate && <TableHead className="w-[150px]">Due Date</TableHead>}
                                {columnVisibility.progress && <TableHead className="w-[120px]">Status</TableHead>}
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
                                        isSelected={selectedTasks.has(task.id)}
                                        onSelectChange={(checked) => handleSelectTask(task.id, checked)}
                                        onTaskUpdated={(updatedTask) => {
                                            // Update the task in state immediately
                                            setTasks(prevTasks =>
                                                prevTasks.map(t =>
                                                    t.id === task.id
                                                        ? { ...t, name: updatedTask.name, taskSlug: updatedTask.taskSlug }
                                                        : t
                                                )
                                            );
                                        }}
                                        onTaskDeleted={(taskId) => {
                                            // Remove the task from state immediately
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
                                            selectedSubTasks={selectedSubTasks}
                                            onSelectSubTask={handleSelectSubTask}
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

            <BulkDeleteDialog
                open={showDeleteDialog}
                onOpenChange={setShowDeleteDialog}
                onConfirm={confirmBulkDelete}
                taskCount={selectedTasks.size}
                subtaskCount={selectedSubTasks.size}
                isDeleting={isDeletingBulk}
            />
        </div>
    );
}
