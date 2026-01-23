"use client";

import { TableCell, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, MoreHorizontal } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TaskWithSubTasks } from "@/components/task/shared/types";
import { EditTaskDialog } from "@/app/w/[workspaceId]/p/[slug]/_components/forms/edit-task-form";
import { DeleteTaskDialog } from "@/app/w/[workspaceId]/p/[slug]/_components/forms/delete-task-form";
import { ColumnVisibility } from "../shared/column-visibility";
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
}: TaskRowProps) {
    const subtaskCount = task._count?.subTasks || 0;

    // Calculate the number of columns to span
    // 2 (expand button) + 1 (task name) + visible columns (not including actions)
    let colSpan = 1; // Start with just task name cell
    if (columnVisibility.project) colSpan++;
    if (columnVisibility.description) colSpan++;
    if (columnVisibility.assignee) colSpan++;
    if (columnVisibility.startDate) colSpan++;
    if (columnVisibility.dueDate) colSpan++;
    if (columnVisibility.status) colSpan++;
    if (columnVisibility.progress) colSpan++;
    if (columnVisibility.tag) colSpan++;

    const handleTaskUpdated = (updatedTask: { name: string; taskSlug: string }) => {
        // Update the task in parent state immediately (Optimistic Level 1)
        if (onTaskUpdated) {
            onTaskUpdated(updatedTask);
        }
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
        <TableRow className={cn(
            "group",
            (task as any).isOptimistic && "opacity-60 grayscale-[0.5]"
        )}>
            <TableCell>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={onToggleExpand}
                >
                    {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                    ) : (
                        <ChevronRight className="h-4 w-4" />
                    )}
                </Button>
            </TableCell>
            <TableCell className="font-medium" colSpan={colSpan}>
                <div className="flex items-center gap-2">
                    <span>{task.name}</span>
                    {subtaskCount > 0 && (
                        <Badge variant="outline" className="text-xs font-normal text-muted-foreground shrink-0">
                            {subtaskCount}
                        </Badge>
                    )}
                    {columnVisibility.project && task.project && (
                        <Badge variant="secondary" className="text-xs font-normal shrink-0">
                            {task.project.name}
                        </Badge>
                    )}
                </div>
            </TableCell>
            <TableCell>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
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
            </TableCell>
        </TableRow>
    );
}
