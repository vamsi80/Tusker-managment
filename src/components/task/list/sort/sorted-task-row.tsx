"use client";

import React from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { getStatusColors, getStatusLabel } from "@/lib/colors/status-colors";
import { formatDate } from "@/components/task/gantt/utils";
import { ColumnVisibility } from "../../shared/column-visibility";
import { cn } from "@/lib/utils";
import { useRemainingDays } from "@/hooks/use-due-date";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getDelayColors, getDelayText } from "@/lib/colors/delay-colors";

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
export const SortedTaskRow = React.memo(function SortedTaskRow({ task, columnVisibility, onClick }: SortedTaskRowProps) {
    const statusColors = getStatusColors(task.status);
    const { remainingDays, isOverdue, dueDate } = useRemainingDays(task.startDate, task.days);

    const delayStyles = getDelayColors(remainingDays, task.status);
    const delayText = getDelayText(remainingDays, task.status);

    const assigneeUser = task.assignee;
    const reviewerUser = task.reviewer;

    return (
        <TableRow
            className="hover:bg-muted/50 cursor-pointer transition-colors"
            onClick={onClick}
        >
            {/* Empty cell for expand/collapse column */}
            <TableCell className="w-[40px] md:w-[50px]" />

            {/* Task Name with Parent Context */}
            <TableCell className="w-[180px] sm:w-[250px] md:w-[350px]">
                <div className="max-w-[230px]">
                    <div
                        className="font-medium text-foreground truncate hover:underline"
                        title={task.name}
                        onMouseEnter={() => {
                            import("@/app/w/[workspaceId]/p/[slug]/_components/shared/subtaskSheet/subtask-details-sheet").then(m => {
                                m.prefetchSubTask(task.id);
                            });
                        }}
                    >
                        {task.name}
                    </div>
                    {task.parentTask && (
                        <div className="flex items-center gap-1 mt-0.5">
                            <svg
                                width="14"
                                height="14"
                                viewBox="0 0 16 16"
                                fill="none"
                                className="flex-shrink-0 text-muted-foreground"
                            >
                                <path
                                    d="M4 2V10H12"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                            </svg>
                            <span className="text-xs text-muted-foreground truncate" title={task.parentTask.name}>
                                {task.parentTask.name}
                            </span>
                        </div>
                    )}
                </div>
            </TableCell>

            {/* Description */}
            {columnVisibility.description && (
                <TableCell className="w-[150px] sm:w-[200px]">
                    <div className="text-sm text-muted-foreground truncate max-w-[180px]">
                        {task.description || "-"}
                    </div>
                </TableCell>
            )}

            {/* Assignee */}
            {columnVisibility.assignee && (
                <TableCell className="w-[80px] sm:w-[100px]">
                    {assigneeUser ? (
                        <div className="flex items-center gap-2 min-w-0">
                            <Avatar className="h-5 w-5 flex-shrink-0">
                                <AvatarFallback className="text-[10px]">
                                    {(assigneeUser.surname || (assigneeUser as any).workspaceMember?.user?.surname)?.[0]?.toUpperCase() || "?"}
                                </AvatarFallback>
                            </Avatar>
                            <span className="text-sm truncate">
                                {assigneeUser.surname}
                            </span>
                        </div>
                    ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                    )}
                </TableCell>
            )}

            {/* Reviewer */}
            {columnVisibility.reviewer && (
                <TableCell className="w-[80px] sm:w-[100px]">
                    {reviewerUser ? (
                        <div className="flex items-center gap-2 min-w-0">
                            <Avatar className="h-5 w-5 flex-shrink-0">
                                <AvatarFallback className="text-[10px]">
                                    {(reviewerUser.surname || (reviewerUser as any).workspaceMember?.user?.surname)?.[0]?.toUpperCase() || "?"}
                                </AvatarFallback>
                            </Avatar>
                            <span className="text-sm truncate">
                                {reviewerUser.surname}
                            </span>
                        </div>
                    ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                    )}
                </TableCell>
            )}

            {/* Status */}
            {columnVisibility.status && (
                <TableCell className="w-[90px] sm:w-[120px]">
                    <Badge
                        variant="outline"
                        className={cn(
                            "text-xs font-medium border",
                            statusColors.color,
                            statusColors.bgColor,
                            statusColors.borderColor
                        )}
                    >
                        {getStatusLabel(task.status)}
                    </Badge>
                </TableCell>
            )}

            {/* Start Date */}
            {columnVisibility.startDate && (
                <TableCell className="w-[90px] sm:w-[120px]">
                    <div className="text-sm">
                        {task.startDate ? formatDate(new Date(task.startDate)) : "-"}
                    </div>
                </TableCell>
            )}

            {/* Due Date */}
            {columnVisibility.dueDate && (
                <TableCell className="w-[90px] sm:w-[120px]">
                    <div className="text-sm">
                        {dueDate ? formatDate(dueDate) : "-"}
                    </div>
                </TableCell>
            )}

            {/* Deadline */}
            {columnVisibility.progress && (
                <TableCell className="w-[100px] sm:w-[150px]">
                    {remainingDays !== null ? (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div className="flex items-center gap-2 min-w-0 cursor-help">
                                    <div className={cn("h-3 w-3 rounded-full flex-shrink-0", delayStyles.dotColor)} />
                                    <div className={cn("text-sm truncate", delayStyles.color)}>
                                        {delayText}
                                    </div>
                                </div>
                            </TooltipTrigger>
                            <TooltipContent>
                                <div className="space-y-1 text-xs">
                                    <div className="font-semibold">Deadline Details</div>
                                    <div>Start: {task.startDate ? formatDate(new Date(task.startDate)) : "N/A"}</div>
                                    <div>Duration: {task.days || 0} days</div>
                                    <div>Due: {dueDate ? formatDate(dueDate) : "N/A"}</div>
                                    <div>Status: {getStatusLabel(task.status)}</div>
                                </div>
                            </TooltipContent>
                        </Tooltip>
                    ) : (
                        <div className="text-sm">
                            {task.days ? `${task.days} days` : "-"}
                        </div>
                    )}
                </TableCell>
            )}

            {/* Tags */}
            {columnVisibility.tag && (
                <TableCell className="w-[100px] sm:w-[120px]">
                    <div className="flex items-center gap-1">
                        {task.tags && task.tags.length > 0 ? (
                            <>
                                <Badge variant="secondary" className="text-[10px] py-0 px-1 whitespace-nowrap truncate max-w-[80px]" title={task.tags[0].name}>
                                    {task.tags[0].name}
                                </Badge>
                                {task.tags.length > 1 && (
                                    <Badge variant="outline" className="text-[10px] py-0 px-1 whitespace-nowrap flex-shrink-0 text-muted-foreground bg-muted/30" title={task.tags.slice(1).map((t: any) => t.name).join(", ")}>
                                        +{task.tags.length - 1}
                                    </Badge>
                                )}
                            </>
                        ) : (
                            <span className="text-muted-foreground text-sm">-</span>
                        )}
                    </div>
                </TableCell>
            )}

            {/* Actions column (empty for now) */}
            <TableCell className="w-[40px]" />
        </TableRow>
    );
});
