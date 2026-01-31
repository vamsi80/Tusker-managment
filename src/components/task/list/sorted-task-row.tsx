"use client";

import React from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { getStatusColors } from "@/lib/colors/status-colors";
import { formatDate } from "@/components/task/gantt/utils";
import { ColumnVisibility } from "../shared/column-visibility";
import { cn } from "@/lib/utils";

interface SortedTaskRowProps {
    task: any;
    columnVisibility: ColumnVisibility;
    onClick?: () => void;
}

/**
 * SortedTaskRow - Renders a flat task row for sorted view
 * 
 * This component displays a single task in the sorted view with:
 * - Task name
 * - Parent task context (if available)
 * - All standard columns (assignee, reviewer, status, dates, etc.)
 * 
 * NO nesting, NO indentation, NO expand/collapse
 */
export function SortedTaskRow({ task, columnVisibility, onClick }: SortedTaskRowProps) {
    const statusColors = getStatusColors(task.status);

    return (
        <TableRow
            className="hover:bg-muted/50 cursor-pointer transition-colors"
            onClick={onClick}
        >
            {/* Empty cell for expand/collapse column */}
            <TableCell className="w-[50px]" />

            {/* Task Name with Parent Context */}
            <TableCell className="w-[250px]">
                <div className="space-y-1 max-w-[230px]">
                    <div className="font-medium text-foreground truncate" title={task.name}>
                        {task.name}
                    </div>
                    {task.parentTask && (
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                            <span className="flex-shrink-0">↳ Parent:</span>
                            <span className="font-medium truncate" title={task.parentTask.name}>
                                {task.parentTask.name}
                            </span>
                        </div>
                    )}
                </div>
            </TableCell>

            {/* Description */}
            {columnVisibility.description && (
                <TableCell className="w-[200px]">
                    <div className="text-sm text-muted-foreground truncate max-w-[180px]">
                        {task.description || "-"}
                    </div>
                </TableCell>
            )}

            {/* Assignee */}
            {columnVisibility.assignee && (
                <TableCell className="w-[100px]">
                    {task.assignee ? (
                        <div className="text-sm truncate">
                            {task.assignee.name} {task.assignee.surname || ""}
                        </div>
                    ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                    )}
                </TableCell>
            )}

            {/* Reviewer */}
            {columnVisibility.reviewer && (
                <TableCell className="w-[100px]">
                    {task.reviewer ? (
                        <div className="text-sm truncate">
                            {task.reviewer.name} {task.reviewer.surname || ""}
                        </div>
                    ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                    )}
                </TableCell>
            )}

            {/* Status */}
            {columnVisibility.status && (
                <TableCell className="w-[100px]">
                    <Badge
                        variant="outline"
                        className={cn(
                            "text-xs font-medium border",
                            statusColors.color,
                            statusColors.bgColor,
                            statusColors.borderColor
                        )}
                    >
                        {task.status.replace(/_/g, " ")}
                    </Badge>
                </TableCell>
            )}

            {/* Start Date */}
            {columnVisibility.startDate && (
                <TableCell className="w-[100px]">
                    <div className="text-sm">
                        {task.startDate ? formatDate(new Date(task.startDate)) : "-"}
                    </div>
                </TableCell>
            )}

            {/* Due Date */}
            {columnVisibility.dueDate && (
                <TableCell className="w-[100px]">
                    <div className="text-sm">
                        {task.startDate && task.days
                            ? formatDate(
                                new Date(
                                    new Date(task.startDate).getTime() + task.days * 24 * 60 * 60 * 1000
                                )
                            )
                            : "-"}
                    </div>
                </TableCell>
            )}

            {/* Progress */}
            {columnVisibility.progress && (
                <TableCell className="w-[100px]">
                    <div className="text-sm">
                        {task.days ? `${task.days} days` : "-"}
                    </div>
                </TableCell>
            )}

            {/* Tag */}
            {columnVisibility.tag && (
                <TableCell className="w-[120px]">
                    {task.tag ? (
                        <Badge variant="secondary" className="text-xs">
                            {task.tag.name}
                        </Badge>
                    ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                    )}
                </TableCell>
            )}

            {/* Actions column (empty for now) */}
            <TableCell className="w-[50px]" />
        </TableRow>
    );
}
