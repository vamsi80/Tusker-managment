"use client";

import { useSortable } from "@dnd-kit/sortable";
import { TableCell, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CornerDownRight, GripVertical, Calendar, Tag, MoreHorizontal } from "lucide-react";
import { SubTaskType } from "@/app/data/task/get-project-tasks";
import { ColumnVisibility } from "./task-table-toolbar";

interface SubTaskRowProps {
    subTask: SubTaskType[number];
    columnVisibility: ColumnVisibility;
    onClick?: (subTask: SubTaskType[number]) => void;
}

export function SubTaskRow({ subTask, columnVisibility, onClick }: SubTaskRowProps) {
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

    const assignee = subTask.assignee?.workspaceMember?.user;

    return (
        <TableRow
            ref={setNodeRef}
            style={style}
            className="bg-muted/10 hover:bg-muted/20 cursor-pointer"
            onClick={() => onClick && onClick(subTask)}
        >
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
                    <span className="text-sm">{subTask.name}</span>
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
                        <DropdownMenuItem>Edit</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive">
                            Delete
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </TableCell>
        </TableRow>
    );
}
