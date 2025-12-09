"use client";

import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { TableCell, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CornerDownRight, GripVertical, Calendar, Tag, MoreHorizontal } from "lucide-react";
import { SubTaskType } from "@/app/data/task/get-project-tasks";
import { ColumnVisibility } from "./task-table-toolbar";
import { EditSubTaskForm } from "../forms/edit-subtask-form";
import { DeleteSubTaskForm } from "../forms/delete-subtask-form";
import { ProjectMembersType } from "@/app/data/project/get-project-members";

interface SubTaskRowProps {
    subTask: SubTaskType[number];
    columnVisibility: ColumnVisibility;
    onClick?: (subTask: SubTaskType[number]) => void;
    members: ProjectMembersType;
    projectId: string;
    parentTaskId: string;
    onSubTaskUpdated?: (subTaskId: string, updatedData: Partial<SubTaskType[number]>) => void;
    onSubTaskDeleted?: (subTaskId: string) => void;
    isSelected?: boolean;
    onSelectChange?: (checked: boolean) => void;
}

export function SubTaskRow({
    subTask,
    columnVisibility,
    onClick,
    members,
    projectId,
    parentTaskId,
    onSubTaskUpdated,
    onSubTaskDeleted,
    isSelected = false,
    onSelectChange,
}: SubTaskRowProps) {
    const [isUpdating, setIsUpdating] = useState(false);

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id: subTask.id,
    });

    // Restrict to vertical movement only
    const style = {
        transform: transform ? `translate3d(0, ${transform.y}px, 0)` : undefined,
        transition,
        zIndex: isDragging ? 10 : "auto",
        opacity: isDragging ? 0.5 : 1,
    };

    // Handle subtask update
    const handleSubTaskUpdated = (updatedData: Partial<SubTaskType[number]>) => {
        // Show skeleton briefly
        setIsUpdating(true);

        // Update the subtask in parent state immediately (optimistic update)
        if (onSubTaskUpdated) {
            onSubTaskUpdated(subTask.id, updatedData);
        }

        // Hide skeleton after parent state is updated
        // The parent's useEffect will sync with server data when router.refresh() completes
        requestAnimationFrame(() => {
            setIsUpdating(false);
        });
    };

    const assignee = subTask.assignee?.workspaceMember?.user;

    // Calculate due date and progress
    const calculateDueDate = () => {
        if (!subTask.startDate || !subTask.days) return null;
        const start = new Date(subTask.startDate);
        const due = new Date(start);
        due.setDate(due.getDate() + subTask.days);
        return due;
    };

    const calculateRemainingDays = () => {
        if (!subTask.startDate || !subTask.days) return null;

        const start = new Date(subTask.startDate);
        const now = new Date();
        const dueDate = new Date(start);
        dueDate.setDate(dueDate.getDate() + subTask.days);

        // Calculate difference in days
        const diffTime = dueDate.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        return diffDays;
    };

    const getProgressColor = () => {
        if (!subTask.startDate || !subTask.days) return "bg-gray-300";

        const remainingDays = calculateRemainingDays();
        if (remainingDays === null) return "bg-gray-300";

        const totalDays = subTask.days;
        const percentRemaining = (remainingDays / totalDays) * 100;

        // Color based on remaining time (quarters)
        if (remainingDays < 0) return "bg-red-500"; // Overdue
        if (percentRemaining > 75) return "bg-green-500"; // 75-100% time left
        if (percentRemaining > 50) return "bg-yellow-500"; // 50-75% time left
        if (percentRemaining > 25) return "bg-orange-500"; // 25-50% time left
        return "bg-red-500"; // 0-25% time left
    };

    const dueDate = calculateDueDate();
    const remainingDays = calculateRemainingDays();
    const progressColor = getProgressColor();

    // Show skeleton while updating
    if (isUpdating) {
        return (
            <TableRow className="bg-muted/10">
                <TableCell className="pl-4">
                    <Skeleton className="h-4 w-4" />
                </TableCell>
                <TableCell className="pl-4">
                    <Skeleton className="h-6 w-6" />
                </TableCell>
                <TableCell className="pl-3">
                    <div className="flex items-center gap-2">
                        <Skeleton className="h-4 w-32" />
                    </div>
                </TableCell>
                {columnVisibility.description && (
                    <TableCell>
                        <Skeleton className="h-4 w-32" />
                    </TableCell>
                )}
                {columnVisibility.assignee && (
                    <TableCell>
                        <Skeleton className="h-8 w-8 rounded-full" />
                    </TableCell>
                )}
                {columnVisibility.tag && (
                    <TableCell>
                        <Skeleton className="h-5 w-20" />
                    </TableCell>
                )}
                {columnVisibility.startDate && (
                    <TableCell>
                        <Skeleton className="h-4 w-24" />
                    </TableCell>
                )}
                {columnVisibility.dueDate && (
                    <TableCell>
                        <Skeleton className="h-4 w-24" />
                    </TableCell>
                )}
                {columnVisibility.progress && (
                    <TableCell>
                        <Skeleton className="h-2 w-full" />
                    </TableCell>
                )}
                <TableCell>
                    <Skeleton className="h-7 w-7" />
                </TableCell>
            </TableRow>
        );
    }

    return (
        <TableRow
            ref={setNodeRef}
            style={style}
            className="bg-muted/10 hover:bg-muted/20"
        >
            {/* <TableCell className="pl-4">
                <Checkbox
                    checked={isSelected}
                    onCheckedChange={onSelectChange}
                    aria-label={`Select ${subTask.name}`}
                />
            </TableCell> */}
            <TableCell className="pl-4">
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 cursor-grab active:cursor-grabbing"
                    {...attributes}
                    {...listeners}
                    onClick={(e) => e.stopPropagation()}
                >
                    <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
            </TableCell>
            <TableCell className="pl-3">
                <div className="flex items-center gap-2">
                    <CornerDownRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span
                        className="truncate text-muted-foreground text-sm max-w-[200px] block cursor-pointer hover:text-foreground transition-colors"
                        onClick={() => onClick && onClick(subTask)}
                    >
                        {subTask.name}
                    </span>
                </div>
            </TableCell>
            {columnVisibility.description && (
                <TableCell>
                    <span
                        className="truncate text-muted-foreground text-sm max-w-[200px] block"
                        title={(subTask as any).description}
                    >
                        {(subTask as any).description || "-"}
                    </span>
                </TableCell>
            )}

            {columnVisibility.assignee && (
                <TableCell>
                    {assignee ? (
                        <div className="flex items-center gap-2">
                            <Avatar className="h-5 w-5">
                                <AvatarImage src={assignee.image || ""} />
                                <AvatarFallback className="text-[10px]">{assignee.name?.[0]}</AvatarFallback>
                            </Avatar>
                            <span className="text-xs text-muted-foreground">
                                {assignee.surname}
                            </span>
                        </div>
                    ) : (
                        <span className="text-xs text-muted-foreground">Unassigned</span>
                    )}
                </TableCell>
            )}
            {columnVisibility.startDate && (
                <TableCell>
                    {subTask.startDate ? (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            {new Date(subTask.startDate).toLocaleDateString('en-GB')}
                        </div>
                    ) : (
                        <span className="text-muted-foreground text-xs">-</span>
                    )}
                </TableCell>
            )}
            {columnVisibility.dueDate && (
                <TableCell>
                    {dueDate ? (
                        <div className="flex items-center gap-2 text-xs font-medium">
                            <Calendar className="h-3 w-3" />
                            {dueDate.toLocaleDateString('en-GB')}
                        </div>
                    ) : (
                        <span className="text-muted-foreground text-xs">-</span>
                    )}
                </TableCell>
            )}
            {columnVisibility.progress && (
                <TableCell>
                    {subTask.startDate && subTask.days && remainingDays !== null ? (
                        <div className="flex items-center gap-2">
                            <div className={`h-3 w-3 rounded-full ${progressColor}`} />
                            <span className="text-xs text-muted-foreground">
                                {remainingDays > 0
                                    ? `${remainingDays} day${remainingDays !== 1 ? 's' : ''} left`
                                    : remainingDays === 0
                                        ? 'Due today'
                                        : `Delay by ${Math.abs(remainingDays)} day${Math.abs(remainingDays) !== 1 ? 's' : ''}`
                                }
                            </span>
                        </div>
                    ) : (
                        <span className="text-muted-foreground text-xs">-</span>
                    )}
                </TableCell>
            )}
            {columnVisibility.status && (
                <TableCell>
                    {subTask.status ? (
                        <div className="flex items-center gap-1">
                            <Tag className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">{subTask.status}</span>
                        </div>
                    ) : (
                        <span className="text-muted-foreground text-xs">-</span>
                    )}
                </TableCell>
            )}
            {columnVisibility.tag && (
                <TableCell>
                    {subTask.tag ? (
                        <div className="flex items-center gap-1">
                            <Tag className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">{subTask.tag}</span>
                        </div>
                    ) : (
                        <span className="text-muted-foreground text-xs">-</span>
                    )}
                </TableCell>
            )}
            <TableCell>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreHorizontal className="h-3.5 w-3.5" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild onSelect={(e) => e.preventDefault()}>
                            <EditSubTaskForm
                                subTask={subTask}
                                members={members}
                                projectId={projectId}
                                parentTaskId={parentTaskId}
                                onSubTaskUpdated={handleSubTaskUpdated}
                            />
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild onSelect={(e) => e.preventDefault()}>
                            <DeleteSubTaskForm
                                subTask={subTask}
                                onSubTaskDeleted={onSubTaskDeleted}
                            />
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </TableCell>
        </TableRow>
    );
}
