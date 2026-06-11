"use client";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TableCell, TableRow } from "@/components/ui/table";
import { ColumnVisibility } from "../shared/column-visibility";
import { TaskWithSubTasks } from "@/components/task/shared/types";
import type { UserPermissionsType } from "@/types/workspace";
import React, { useRef, useEffect, useState, memo, cloneElement } from "react";
import type { SubTaskType } from "@/types/task";
import { ChevronDown, ChevronRight, MoreHorizontal, CornerDownRight } from "lucide-react";
import { EditTaskDialog } from "@/app/w/[workspaceId]/p/[slug]/_components/forms/edit-task-form";
import { DeleteTaskDialog } from "@/app/w/[workspaceId]/p/[slug]/_components/forms/delete-task-form";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";


interface TaskRowProps {
    task: TaskWithSubTasks;
    isExpanded: boolean;
    onToggleExpand: () => void;
    columnVisibility: ColumnVisibility;
    isUpdating?: boolean;
    onUpdateStart?: () => void;
    onUpdateEnd?: () => void;
    onTaskUpdated?: (updatedTask: { name: string; taskSlug: string }) => void;
    onTaskDeleted?: (taskId: string) => void;
    permissions?: UserPermissionsType;
    userId?: string;
    isWorkspaceAdmin?: boolean;
    leadProjectIds?: string[];
    coordinatorProjectIds?: string[];
    projects?: Array<{ id: string; canManageMembers?: boolean }>;
    isSubtask?: boolean;
    onRequestSubtasks?: (taskId: string) => void;
    isCached?: boolean;
    scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
    children?: React.ReactNode;
    isSubtaskRow?: boolean;
}

export const TaskRow = memo(function TaskRow({
    task: initialTask,
    isExpanded,
    onToggleExpand,
    columnVisibility,
    isUpdating = false,
    onUpdateStart,
    onUpdateEnd,
    onTaskUpdated,
    onTaskDeleted,
    permissions,
    userId,
    isWorkspaceAdmin,
    leadProjectIds,
    coordinatorProjectIds,
    projects,
    onRequestSubtasks,
    isCached = false,
    isSubtask = false,
    isSubtaskRow = false,
    scrollContainerRef,
    children,
}: TaskRowProps) {
    const [task, setTask] = useState(initialTask);

    useEffect(() => {
        setTask(initialTask);
    }, [initialTask]);

    const subtaskCount = Math.max(task.subtaskCount || 0, task._count?.subTasks || 0);
    const rowRef = useRef<HTMLTableRowElement>(null);

    useEffect(() => {
        if (!isExpanded || !onRequestSubtasks || subtaskCount === 0 || task.subTasks !== undefined) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    onRequestSubtasks(task.id);
                    observer.disconnect();
                }
            },
            { rootMargin: "150px" }
        );

        const currentRef = rowRef.current;
        if (currentRef) {
            observer.observe(currentRef);
        }

        return () => {
            observer.disconnect();
        };
    }, [isExpanded, task.subTasks, task.id, subtaskCount, onRequestSubtasks]);

    const visiblePropsCount = Object.entries(columnVisibility)
        .filter(([key, visible]) => key !== 'project' && visible)
        .length;
    const totalColSpan = 2 + visiblePropsCount + 1;

    const handleTaskUpdated = (updatedTask: { name: string; taskSlug: string }) => {
        onTaskUpdated?.(updatedTask);
        setTask((prev) => ({ ...prev, name: updatedTask.name, taskSlug: updatedTask.taskSlug }));
    };

    const handleOptimisticSubTaskUpdated = (subTaskId: string, updatedData: Partial<SubTaskType>) => {
        setTask((prev) => ({
            ...prev,
            subTasks: prev.subTasks?.map((st) =>
                st.id === subTaskId ? { ...st, ...updatedData } : st
            ),
        }));
    };

    const handleSubTaskDeleted = (subTaskId: string) => {
        const subTaskToDelete = task.subTasks?.find((st) => st.id === subTaskId);
        const wasCompleted = subTaskToDelete?.status === "COMPLETED";

        setTask((prev) => ({
            ...prev,
            subTasks: prev.subTasks?.filter((st) => st.id !== subTaskId),
            subtaskCount: Math.max(0, (prev.subtaskCount || 0) - 1),
            completedSubtaskCount: wasCompleted
                ? Math.max(0, (prev.completedSubtaskCount || 0) - 1)
                : (prev.completedSubtaskCount || 0),
        }));
    };

    const handleSubTaskCreated = (newSubTask: SubTaskType) => {
        setTask((prev) => {
            const currentSubTasks = prev.subTasks || [];
            if (currentSubTasks.some((st) => st.id === newSubTask.id)) return prev;

            return {
                ...prev,
                subTasks: [newSubTask, ...currentSubTasks],
                subtaskCount: (prev.subtaskCount || 0) + 1,
                completedSubtaskCount:
                    newSubTask.status === "COMPLETED"
                        ? (prev.completedSubtaskCount || 0) + 1
                        : (prev.completedSubtaskCount || 0),
            };
        });
    };

    const canEditTask = () => {
        const taskCreatorId = task.createdBy?.id;

        if (permissions) {
            return (
                permissions.isWorkspaceAdmin ||
                permissions.isProjectManager ||
                permissions.isProjectCoordinator ||
                (permissions.isProjectLead && taskCreatorId === userId)
            );
        }

        if (isWorkspaceAdmin) return true;

        if (coordinatorProjectIds?.includes(task.projectId)) return true;

        const taskProject = projects?.find((p) => p.id === task.projectId);
        if (taskProject?.canManageMembers) return true;

        if (leadProjectIds?.includes(task.projectId) && taskCreatorId === userId) {
            return true;
        }

        return false;
    };

    if (isUpdating) {
        return (
            <TableRow className="group">
                <TableCell>
                    <Skeleton className="size-4" />
                </TableCell>
                <TableCell>
                    <Skeleton className="size-8" />
                </TableCell>
                <TableCell className="font-medium" colSpan={totalColSpan}>
                    <Skeleton className="h-5 w-[200px]" />
                </TableCell>
                <TableCell>
                    <Skeleton className="size-8" />
                </TableCell>
            </TableRow>
        );
    }

    return (
        <>
            <TableRow
                ref={rowRef}
                className="group [&_td]:py-2 hover:bg-muted/30 transition-colors"
            >
                <TableCell className="w-[40px] md:w-[50px]">
                    {isSubtaskRow ? (
                        <div className="flex items-center justify-center pl-4">
                            <CornerDownRight className="size-3.5 text-muted-foreground/50" />
                        </div>
                    ) : (
                        !isSubtask && (
                            <div className="flex items-center justify-center">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-6 shrink-0 p-0"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onToggleExpand();
                                    }}
                                >
                                    {isExpanded ? (
                                        <ChevronDown className="size-4" />
                                    ) : (
                                        <ChevronRight className="size-4" />
                                    )}
                                </Button>
                            </div>
                        )
                    )}
                </TableCell>

                <TableCell className="px-2" colSpan={totalColSpan}>
                    <div className="flex items-center gap-2 min-w-0">
                        <span className={cn(
                            "truncate text-sm cursor-pointer hover:text-primary transition-colors",
                            isSubtaskRow ? "text-muted-foreground" : "font-semibold"
                        )}>
                            {task.name}
                        </span>
                        {subtaskCount > 0 && (
                            <span className="text-xs text-muted-foreground shrink-0 font-medium">
                                ({subtaskCount})
                            </span>
                        )}

                        <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                            {canEditTask() && (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" className="size-6">
                                            <MoreHorizontal className="size-3" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem
                                            asChild
                                            onSelect={(e) => e.preventDefault()}
                                        >
                                            <EditTaskDialog
                                                task={task}
                                                onTaskUpdated={handleTaskUpdated}
                                                onUpdateStart={onUpdateStart}
                                                onUpdateEnd={onUpdateEnd}
                                            />
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            asChild
                                            onSelect={(e) => e.preventDefault()}
                                        >
                                            <DeleteTaskDialog
                                                task={task}
                                                onTaskDeleted={onTaskDeleted}
                                            />
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            )}
                        </div>
                    </div>
                </TableCell>
            </TableRow>
            {isExpanded &&
                children &&
                (() => {
                    type SubTaskListProps = {
                        task?: TaskWithSubTasks;
                        onSubTaskUpdated?: (id: string, data: Partial<SubTaskType>) => void;
                        onSubTaskDeleted?: (id: string) => void;
                        onSubTaskCreated?: (subTask: SubTaskType) => void;
                        onSubTasksReordered?: (parentId: string, subTasks: SubTaskType[]) => void;
                    };
                    const child = children as React.ReactElement<SubTaskListProps>;
                    return cloneElement(child, {
                        task,
                        onSubTaskUpdated: (subTaskId: string, updatedData: Partial<SubTaskType>) => {
                            handleOptimisticSubTaskUpdated(subTaskId, updatedData);
                            child.props.onSubTaskUpdated?.(subTaskId, updatedData);
                        },
                        onSubTaskDeleted: (subTaskId: string) => {
                            handleSubTaskDeleted(subTaskId);
                            child.props.onSubTaskDeleted?.(subTaskId);
                        },
                        onSubTaskCreated: (newSubTask: SubTaskType) => {
                            handleSubTaskCreated(newSubTask);
                            child.props.onSubTaskCreated?.(newSubTask);
                        },
                        onSubTasksReordered: (parentId: string, newSubTasks: SubTaskType[]) => {
                            setTask((prev) => ({
                                ...prev,
                                subTasks: newSubTasks,
                            }));
                            child.props.onSubTasksReordered?.(parentId, newSubTasks);
                        },
                    });
                })()}
        </>
    );
});

