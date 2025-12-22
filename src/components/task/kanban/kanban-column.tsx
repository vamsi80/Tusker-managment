"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SubTaskType } from "@/data/task";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { KanbanCard } from "./kanban-card";

type TaskStatus = "TO_DO" | "IN_PROGRESS" | "BLOCKED" | "REVIEW" | "HOLD" | "COMPLETED";

interface KanbanColumnProps {
    column: {
        id: TaskStatus;
        title: string;
        color: string;
        bgColor: string;
        borderColor: string;
    };
    subTasks: SubTaskType[];
    totalCount: number;
    hasMore: boolean;
    isLoadingMore: boolean;
    onSubTaskClick: (subTask: SubTaskType) => void;
    onLoadMore: () => void;
}

/**
 * Kanban Column Component
 * 
 * A droppable column for the Kanban board that displays subtasks for a specific status.
 * Features:
 * - Drag and drop support via @dnd-kit
 * - Individual scrolling per column
 * - Load more pagination
 * - Visual feedback when dragging over
 * - Custom ultra-thin scrollbar
 * 
 * @param column - Column configuration (id, title, colors)
 * @param subTasks - Array of subtasks to display in this column
 * @param totalCount - Total number of subtasks for this status
 * @param hasMore - Whether there are more subtasks to load
 * @param isLoadingMore - Whether currently loading more subtasks
 * @param onSubTaskClick - Callback when a subtask is clicked
 * @param onLoadMore - Callback to load more subtasks
 */
export function KanbanColumn({
    column,
    subTasks,
    totalCount,
    hasMore,
    isLoadingMore,
    onSubTaskClick,
    onLoadMore,
}: KanbanColumnProps) {
    const { setNodeRef, isOver } = useDroppable({
        id: column.id,
    });

    return (
        <div className="flex-shrink-0 w-80 flex flex-col h-full">
            {/* Column Header */}
            <div
                className={cn(
                    "border-2 border-b p-4",
                    column.borderColor,
                    column.bgColor
                )}
            >
                <div className="flex items-center justify-between">
                    <h3 className={cn("font-semibold text-sm", column.color)}>
                        {column.title}
                    </h3>
                    <Badge
                        variant="secondary"
                        className={cn("text-xs", column.color)}
                    >
                        {subTasks.length} / {totalCount}
                    </Badge>
                </div>
            </div>

            {/* Column Content with individual scroll */}
            <div
                ref={setNodeRef}
                className={cn(
                    "flex-1 p-3 transition-all overflow-y-auto",
                    isOver ? "border-4" : "border-2 border-t-0",
                    column.borderColor,
                    // Custom ultra-thin scrollbar
                    "[&::-webkit-scrollbar]:w-0.5",
                    "[&::-webkit-scrollbar-track]:bg-transparent",
                    "[&::-webkit-scrollbar-thumb]:bg-slate-300",
                    "[&::-webkit-scrollbar-thumb]:rounded-full",
                    "[&::-webkit-scrollbar-thumb]:hover:bg-slate-400"
                )}
            >
                <SortableContext
                    items={subTasks.map((t) => t.id)}
                    strategy={verticalListSortingStrategy}
                >
                    <div className="space-y-3 min-h-[100px]">
                        {subTasks.map((subTask) => (
                            <KanbanCard
                                key={subTask.id}
                                subTask={subTask}
                                columnColor={column.color}
                                onSubTaskClick={onSubTaskClick}
                            />
                        ))}

                        {/* Load More Button */}
                        {hasMore && (
                            <Button
                                variant="outline"
                                size="sm"
                                className="w-full"
                                onClick={onLoadMore}
                                disabled={isLoadingMore}
                            >
                                {isLoadingMore ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Loading...
                                    </>
                                ) : (
                                    `Load More (${totalCount - subTasks.length} remaining)`
                                )}
                            </Button>
                        )}

                        {subTasks.length === 0 && (
                            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                                No subtasks
                            </div>
                        )}
                    </div>
                </SortableContext>
            </div>
        </div>
    );
}
