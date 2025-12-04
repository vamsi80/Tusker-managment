"use client";

import { TableCell, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, MoreHorizontal } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ColumnVisibility } from "./task-table-toolbar";
import { TaskWithSubTasks } from "./types";
import { Badge } from "@/components/ui/badge";

interface TaskRowProps {
    task: TaskWithSubTasks;
    isExpanded: boolean;
    onToggleExpand: () => void;
    columnVisibility: ColumnVisibility;
}

export function TaskRow({
    task,
    isExpanded,
    onToggleExpand,
    columnVisibility,
}: TaskRowProps) {
    const subtaskCount = task._count?.subTasks || 0;

    // Calculate the number of columns to span
    // 1 (expand button) + 1 (task name) + visible columns (not including actions)
    let colSpan = 1; // Start with just task name cell
    if (columnVisibility.description) colSpan++;
    if (columnVisibility.assignee) colSpan++;
    if (columnVisibility.startDate) colSpan++;
    if (columnVisibility.dueDate) colSpan++;
    if (columnVisibility.progress) colSpan++;
    if (columnVisibility.tag) colSpan++;

    return (
        <TableRow className="group">
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
