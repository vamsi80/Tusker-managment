"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TableCell, TableRow } from "@/components/ui/table";
import { ColumnVisibility } from "../shared/column-visibility";
import { TaskWithSubTasks } from "@/components/task/shared/types";
import type { UserPermissionsType } from "@/data/user/get-user-permissions";
import { useRef, useEffect, useState, memo, cloneElement } from "react";
import { ChevronDown, ChevronRight, MoreHorizontal } from "lucide-react";
import { EditTaskDialog } from "@/app/w/[workspaceId]/p/[slug]/_components/forms/edit-task-form";
import { DeleteTaskDialog } from "@/app/w/[workspaceId]/p/[slug]/_components/forms/delete-task-form";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";


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
    projects?: Array<{ id: string; canManageMembers?: boolean }>;
    isSubtask?: boolean;
    onRequestSubtasks?: (taskId: string) => void;
    isCached?: boolean;
    scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
    children?: React.ReactNode;
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
    projects,
    onRequestSubtasks,
    isCached = false,
    scrollContainerRef,
    children,
}: TaskRowProps) {
    const [task, setTask] = useState(initialTask);

    useEffect(() => {
        setTask(initialTask);
    }, [initialTask]);

    const subtaskCount = Math.max(task.subtaskCount || 0, (task as any)._count?.subTasks || 0);
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

    let colSpan = 2;
    if (columnVisibility.description) colSpan++;
    if (columnVisibility.assignee) colSpan++;
    if (columnVisibility.reviewer) colSpan++;
    if (columnVisibility.status) colSpan++;
    if (columnVisibility.startDate) colSpan++;
    if (columnVisibility.dueDate) colSpan++;
    if (columnVisibility.progress) colSpan++;
    if (columnVisibility.tag) colSpan++;

    const handleTaskUpdated = (updatedTask: { name: string; taskSlug: string }) => {
        onTaskUpdated?.(updatedTask);
        setTask((prev) => ({ ...prev, name: updatedTask.name, taskSlug: updatedTask.taskSlug }));
    };

    const handleOptimisticSubTaskUpdated = (subTaskId: string, updatedData: any) => {        setTask((prev) => ({
            ...prev,
            subTasks: prev.subTasks?.map((st: any) =>
                st.id === subTaskId ? { ...st, ...updatedData } : st
            ),
        }));
    };

    const handleSubTaskDeleted = (subTaskId: string) => {        const subTaskToDelete = task.subTasks?.find((st: any) => st.id === subTaskId);
        const wasCompleted = subTaskToDelete?.status === "COMPLETED";

        setTask((prev) => ({
            ...prev,
            subTasks: prev.subTasks?.filter((st: any) => st.id !== subTaskId),
            subtaskCount: Math.max(0, (prev.subtaskCount || 0) - 1),
            completedSubtaskCount: wasCompleted
                ? Math.max(0, (prev.completedSubtaskCount || 0) - 1)
                : (prev.completedSubtaskCount || 0),
        }));
    };

    const handleSubTaskCreated = (newSubTask: any) => {        setTask((prev) => {
            const currentSubTasks = prev.subTasks || [];
            if (currentSubTasks.some((st: any) => st.id === newSubTask.id)) return prev;

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
                (permissions.isProjectLead && taskCreatorId === userId)
            );
        }

        if (isWorkspaceAdmin) return true;

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
                    <Skeleton className="h-4 w-4" />
                </TableCell>
                <TableCell>
                    <Skeleton className="h-8 w-8" />
                </TableCell>
                <TableCell className="font-medium" colSpan={colSpan}>
                    <Skeleton className="h-5 w-[200px]" />
                </TableCell>
                <TableCell>
                    <Skeleton className="h-8 w-8" />
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
                    <div className="flex items-center justify-center">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0 p-0"
                            onClick={(e) => {
                                e.stopPropagation();
                                onToggleExpand();
                            }}
                        >
                            {isExpanded ? (
                                <ChevronDown className="h-4 w-4" />
                            ) : (
                                <ChevronRight className="h-4 w-4" />
                            )}
                        </Button>
                    </div>
                </TableCell>

                <TableCell className="px-2" colSpan={colSpan}>
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="truncate font-semibold text-sm cursor-pointer hover:text-primary transition-colors">
                            {task.name}
                        </span>
                        {subtaskCount > 0 && (
                            <span className="text-xs text-muted-foreground shrink-0">
                                ({subtaskCount})
                            </span>
                        )}

                        <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                            {canEditTask() && (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-6 w-6">
                                            <MoreHorizontal className="h-3 w-3" />
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
                cloneElement(children as any, {
                    task,
                    onSubTaskUpdated: (subTaskId: string, updatedData: any) => {
                        handleOptimisticSubTaskUpdated(subTaskId, updatedData);
                        (children as any).props.onSubTaskUpdated?.(subTaskId, updatedData);
                    },
                    onSubTaskDeleted: (subTaskId: string) => {
                        handleSubTaskDeleted(subTaskId);
                        (children as any).props.onSubTaskDeleted?.(subTaskId);
                    },
                    onSubTaskCreated: (newSubTask: any) => {
                        handleSubTaskCreated(newSubTask);
                        (children as any).props.onSubTaskCreated?.(newSubTask);
                    },
                })}
        </>
    );
});
