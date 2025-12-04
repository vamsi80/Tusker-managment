"use client";

import { TableCell, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight } from "lucide-react";
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
    // 1 (expand button) + 1 (task name) + visible columns + 1 (actions)
    let colSpan = 2; // Start with task name cell + actions cell
    if (columnVisibility.description) colSpan++;
    if (columnVisibility.assignee) colSpan++;
    if (columnVisibility.startDate) colSpan++;
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
        </TableRow>
    );
}
