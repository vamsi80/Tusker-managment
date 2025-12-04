"use client";

import React, { useState, useEffect } from "react";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from "@dnd-kit/core";
import {
    arrayMove,
    sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronsDown } from "lucide-react";
import { ProjectTasksResponse, getProjectTasks, getTaskSubTasks } from "@/app/data/task/get-project-tasks";
import { ProjectMembersType } from "@/app/data/project/get-project-members";
import { TaskTableToolbar, ColumnVisibility } from "./table/task-table-toolbar";
import { TaskRow } from "./table/task-row";
import { SubTaskList } from "./table/subtask-list";
import { TaskWithSubTasks } from "./table/types";

interface TaskDataProps {
    initialTasksData: ProjectTasksResponse;
    members: ProjectMembersType;
    workspaceId: string;
    projectId: string;
    canCreateSubTask: boolean;
}

export function TaskData({
    initialTasksData,
    members,
    workspaceId,
    projectId,
    canCreateSubTask,
}: TaskDataProps) {
    const [tasks, setTasks] = useState<TaskWithSubTasks[]>(initialTasksData.tasks);
    const [currentPage, setCurrentPage] = useState(initialTasksData.currentPage);
    const [hasMoreTasks, setHasMoreTasks] = useState(initialTasksData.hasMore);
    const [loadingMoreTasks, setLoadingMoreTasks] = useState(false);

    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    const [loadingSubTasks, setLoadingSubTasks] = useState<Record<string, boolean>>({});
    const [loadingMoreSubTasks, setLoadingMoreSubTasks] = useState<Record<string, boolean>>({});

    const [searchQuery, setSearchQuery] = useState("");
    const [tagFilter, setTagFilter] = useState<string | null>(null);
    const [columnVisibility, setColumnVisibility] = useState<ColumnVisibility>({
        assignee: true,
        dueDate: true,
        tag: true,
    });

    // Auto-load subtasks for all initial tasks on mount
    useEffect(() => {
        const loadInitialSubTasks = async () => {
            // Load subtasks for all initially loaded parent tasks
            const taskIds = initialTasksData.tasks.map(t => t.id);

            for (const taskId of taskIds) {
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
                    console.error(`Error loading subtasks for task ${taskId}:`, error);
                } finally {
                    setLoadingSubTasks((prev) => ({ ...prev, [taskId]: false }));
                }
            }
        };

        loadInitialSubTasks();
    }, [initialTasksData.tasks]);

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

        if (!over || active.id === over.id) {
            return;
        }

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

    // Filter tasks based on search and tag
    const filteredTasks = tasks.filter((task) => {
        const matchesSearch = task.name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesTag = !tagFilter || task.tag === tagFilter;
        return matchesSearch && matchesTag;
    });

    // Get unique tags for filter
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

            {/* Table */}
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
                                <TableHead className="min-w-[400px]">Task Name</TableHead>
                                {columnVisibility.assignee && <TableHead className="w-[200px]">Assignee</TableHead>}
                                {columnVisibility.dueDate && <TableHead className="w-[180px]">Due Date</TableHead>}
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
                                        />
                                    )}
                                </React.Fragment>
                            ))}
                            {filteredTasks.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-24 text-center">
                                        No tasks found.
                                    </TableCell>
                                </TableRow>
                            )}

                            {/* Load More Tasks Button */}
                            {hasMoreTasks && (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center p-4">
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