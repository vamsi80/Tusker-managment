"use client";

import { useRef, useEffect, useState, memo, ReactElement, cloneElement } from "react";
import { cn } from "@/lib/utils";
import { TableCell, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, MoreHorizontal } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TaskWithSubTasks } from "@/components/task/shared/types";
import { EditTaskDialog } from "@/app/w/[workspaceId]/p/[slug]/_components/forms/edit-task-form";
import { ColumnVisibility } from "../shared/column-visibility";
import { UserPermissionsType } from "@/data/user/get-user-permissions";
import { DeleteTaskDialog } from "@/app/w/[workspaceId]/p/[slug]/_components/forms/delete-task-form";

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
    children
}: TaskRowProps) {
    // MAINTAIN OPTIMISTIC LOCAL STATE FOR SMOOTHEST DRAG & DROP / EDITS
    const [task, setTask] = useState(initialTask);

    // Sync with upstream database overrides seamlessly
    useEffect(() => {
        setTask(initialTask);
    }, [initialTask]);

    const subtaskCount = task._count?.subTasks || 0;
    const rowRef = useRef<HTMLTableRowElement>(null);

    // Lazy load subtasks when visible and expanded
    useEffect(() => {
        if (!isExpanded || !onRequestSubtasks || (task.subTasks !== undefined) || subtaskCount === 0) return;

        // If data is already in cache, load immediately without waiting for intersection
        if (isCached) {
            onRequestSubtasks(task.id);
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    onRequestSubtasks(task.id);
                }
            },
            { rootMargin: "100px" }
        );

        if (rowRef.current) {
            observer.observe(rowRef.current);
        }

        return () => observer.disconnect();
    }, [isExpanded, task.subTasks, task.id, subtaskCount, onRequestSubtasks, isCached]);

    // Calculate the number of columns to span
    // 2 (expand button) + 1 (task name) + visible columns (not including actions)
    let colSpan = 1;
    // Project column removed
    if (columnVisibility.description) colSpan++;
    if (columnVisibility.assignee) colSpan++;
    if (columnVisibility.startDate) colSpan++;
    if (columnVisibility.dueDate) colSpan++;
    if (columnVisibility.status) colSpan++;
    if (columnVisibility.progress) colSpan++;
    if (columnVisibility.tag) colSpan++;
    if (columnVisibility.reviewer) colSpan++; // Added reviewer

    const handleTaskUpdated = (updatedTask: { name: string; taskSlug: string }) => {
        // Update the task in parent state immediately (Optimistic Level 1)
        setTask(prev => ({ ...prev, name: updatedTask.name, taskSlug: updatedTask.taskSlug }));
        if (onTaskUpdated) {
            onTaskUpdated(updatedTask);
        }
    };

    const handleOptimisticSubTaskUpdated = (subTaskId: string, updatedData: any) => {
        setTask(prev => ({
            ...prev,
            subTasks: prev.subTasks?.map((st: any) => st.id === subTaskId ? { ...st, ...updatedData } : st)
        }));
    };

    const handleOptimisticSubTaskDeleted = (subTaskId: string) => {
        setTask(prev => ({
            ...prev,
            subTasks: prev.subTasks?.filter((st: any) => st.id !== subTaskId),
            _count: {
                ...prev._count,
                subTasks: Math.max(0, (prev._count?.subTasks || 0) - 1)
            }
        }));
    };

    const handleOptimisticSubTaskCreated = (newSubTask: any, tempId?: string) => {
        setTask(prev => {
            const currentSubTasks = prev.subTasks || [];
            if (tempId) {
                return {
                    ...prev,
                    subTasks: currentSubTasks.map((st: any) => st.id === tempId ? newSubTask : st)
                };
            }
            if (currentSubTasks.some((st: any) => st.id === newSubTask.id)) return prev;

            return {
                ...prev,
                subTasks: [...currentSubTasks, newSubTask],
                _count: {
                    ...prev._count,
                    subTasks: (prev.subTasks?.length || 0) + 1
                }
            };
        });
    };

    // Determine if user can edit/delete this task
    const canEditTask = () => {
        // Get the creator ID - handle both direct field and relation object
        const taskCreatorId = (task as any).createdById || (task as any).createdBy?.userId;

        // Project view (has permissions object)
        if (permissions) {
            return permissions.isWorkspaceAdmin ||
                permissions.isProjectManager ||
                (permissions.isProjectLead && taskCreatorId === userId);
        }

        // Workspace view (use alternative data)
        if (isWorkspaceAdmin) return true;

        // Check if user is PROJECT_MANAGER of this task's project
        const taskProject = projects?.find(p => p.id === task.projectId);
        if (taskProject?.canManageMembers) return true;

        // Check if user is LEAD in this project and created the task
        if (leadProjectIds?.includes(task.projectId) && taskCreatorId === userId) {
            return true;
        }

        return false;
    };

    // Show skeleton while updating OR while refresh is pending
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
                className={cn(
                    "group [&_td]:py-2",
                    (task as any).isOptimistic && "opacity-60 grayscale-[0.5]"
                )}>
                <TableCell className="font-semibold text-sm" colSpan={colSpan + 1} >
                    <div className="flex items-center gap-2 ml-2">
                        <div className="flex items-center">
                            <div className="flex items-center gap-0">
                                <div className="w-2 shrink-0" />
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-4 w-4 shrink-0 p-0.5"
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
                        </div>
                        <span className="truncate">{task.name}</span>
                        {subtaskCount > 0 && (
                            <span className="text-xs text-muted-foreground">
                                {subtaskCount}
                            </span>
                        )}
                    </div>
                </TableCell>
                <TableCell>
                    {canEditTask() && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6">
                                    <MoreHorizontal className="h-2 w-2" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem asChild onSelect={(e) => e.preventDefault()}>
                                    <EditTaskDialog
                                        task={task}
                                        onTaskUpdated={handleTaskUpdated}
                                        onUpdateStart={onUpdateStart}
                                        onUpdateEnd={onUpdateEnd}
                                    />
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild onSelect={(e) => e.preventDefault()}>
                                    <DeleteTaskDialog
                                        task={task}
                                        onTaskDeleted={onTaskDeleted}
                                    />
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </TableCell>
            </TableRow>
            {isExpanded && children && cloneElement(children as any, {
                task,
                onSubTaskUpdated: (subTaskId: string, updatedData: any) => {
                    handleOptimisticSubTaskUpdated(subTaskId, updatedData);
                    (children as any).props.onSubTaskUpdated?.(subTaskId, updatedData);
                },
                onSubTaskDeleted: (subTaskId: string) => {
                    handleOptimisticSubTaskDeleted(subTaskId);
                    (children as any).props.onSubTaskDeleted?.(subTaskId);
                },
                onSubTaskCreated: (newSubTask: any, tempId?: string) => {
                    handleOptimisticSubTaskCreated(newSubTask, tempId);
                    (children as any).props.onSubTaskCreated?.(newSubTask, tempId);
                }
            })}
        </>
    );
});
