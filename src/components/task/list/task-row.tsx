"use client";

import { cn } from "@/lib/utils";
import { TableCell, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, MoreHorizontal, CornerDownRight } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TaskWithSubTasks } from "@/components/task/shared/types";
import { EditTaskDialog } from "@/app/w/[workspaceId]/p/[slug]/_components/forms/edit-task-form";
import { DeleteTaskDialog } from "@/app/w/[workspaceId]/p/[slug]/_components/forms/delete-task-form";
import { ColumnVisibility } from "../shared/column-visibility";
import { UserPermissionsType } from "@/data/user/get-user-permissions";

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
    // Permission props
    permissions?: UserPermissionsType; // For project view
    userId?: string;
    isWorkspaceAdmin?: boolean; // For workspace view
    leadProjectIds?: string[]; // For workspace view
    projects?: Array<{ id: string; canManageMembers?: boolean }>; // For workspace view
    children?: React.ReactNode;
}

export function TaskRow({
    task,
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
    children
}: TaskRowProps) {
    const subtaskCount = task._count?.subTasks || 0;

    // Calculate the number of columns to span
    // 2 (expand button) + 1 (task name) + visible columns (not including actions)
    let colSpan = 1; // Start with just task name cell
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
        if (onTaskUpdated) {
            onTaskUpdated(updatedTask);
        }
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
                className={cn(
                    "group [&_td]:py-1",
                    (task as any).isOptimistic && "opacity-60 grayscale-[0.5]"
                )}>
                <TableCell>
                    <div className="flex items-center justify-end pr-1">
                        <CornerDownRight className="h-3 w-3 text-muted-foreground mr-1" />
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={onToggleExpand}
                        >
                            {isExpanded ? (
                                <ChevronDown className="h-2 w-2" />
                            ) : (
                                <ChevronRight className="h-2 w-2" />
                            )}
                        </Button>
                    </div>
                </TableCell>
                <TableCell className="font-medium" colSpan={colSpan}>
                    <div className="flex items-center gap-2">
                        <span>{task.name}</span>
                        {subtaskCount > 0 && (
                            <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-normal text-muted-foreground shrink-0 flex items-center justify-center">
                                {subtaskCount}
                            </Badge>
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
            {isExpanded && children}
        </>
    );
}
