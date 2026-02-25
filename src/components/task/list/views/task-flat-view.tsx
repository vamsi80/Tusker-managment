"use client";

import React from "react";
import { TaskWithSubTasks } from "@/components/task/shared/types";
import { SortedTaskRow } from "../sorted-task-row";
import { TableRow, TableCell } from "@/components/ui/table";

interface TaskFlatViewProps {
    tasks: TaskWithSubTasks[];
    columnVisibility: any;
    visibleColumnsCount: number;
    handleSubTaskClick: (subTask: any) => void;
}

export function TaskFlatView({
    tasks,
    columnVisibility,
    visibleColumnsCount,
    handleSubTaskClick,
}: TaskFlatViewProps) {
    if (tasks.length === 0) {
        return (
            <TableRow>
                <TableCell colSpan={visibleColumnsCount} className="h-24 text-center text-muted-foreground">
                    No tasks found.
                </TableCell>
            </TableRow>
        );
    }

    return (
        <>
            {tasks.map((task) => (
                <SortedTaskRow
                    key={task.id}
                    task={task}
                    columnVisibility={columnVisibility}
                    onClick={() => handleSubTaskClick(task)}
                />
            ))}
        </>
    );
}
