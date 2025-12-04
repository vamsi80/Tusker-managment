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
    const assignee = task.assignee?.workspaceMember?.user;

    const subtaskAssignees = task.subTasks
        ?.map((st) => st.assignee?.workspaceMember?.user)
        .filter((user, index, self) =>
            user && self.findIndex((u) => u?.id === user.id) === index
        ) || [];

    const subtaskCount = task._count?.subTasks || 0;

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
            <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                    <span>{task.name}</span>
                    {subtaskCount > 0 && (
                        <Badge variant="outline" className="text-xs font-normal text-muted-foreground shrink-0">
                            {subtaskCount}
                        </Badge>
                    )}
                </div>
            </TableCell>
            {columnVisibility.assignee && <TableCell></TableCell>}
            {columnVisibility.dueDate && <TableCell></TableCell>}
            {columnVisibility.tag && <TableCell></TableCell>}
            <TableCell></TableCell>
        </TableRow>
    );
}
