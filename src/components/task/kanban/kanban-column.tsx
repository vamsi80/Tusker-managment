"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Badge } from "@/components/ui/badge";
import { KanbanSubTaskType } from "@/data/task/kanban";
import { cn } from "@/lib/utils";
import { KanbanCard } from "./kanban-card";
import { KanbanCardSkeleton } from "./kanban-skeleton";
import { useInView } from "react-intersection-observer";
import { useEffect } from "react";

type TaskStatus = "TO_DO" | "IN_PROGRESS" | "REVIEW" | "HOLD" | "COMPLETED" | "CANCELLED";

interface KanbanColumnProps {
    column: {
        id: TaskStatus;
        title: string;
        color: string;
        bgColor: string;
        borderColor: string;
    };
    subTasks: KanbanSubTaskType[];
    totalCount: number;
    hasMore: boolean;
    isLoadingMore: boolean;
    onSubTaskClick: (subTask: KanbanSubTaskType) => void;
    onLoadMore: () => void;
}

/**
 * Kanban Column Component
 * ...
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

    const { ref: loadMoreRef, inView } = useInView({
        threshold: 0,
        rootMargin: '100px', // Trigger before hitting bottom slightly
    });

    useEffect(() => {
        if (inView && hasMore && !isLoadingMore) {
            onLoadMore();
        }
    }, [inView, hasMore, isLoadingMore, onLoadMore]);

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

                        {/* Infinite Scroll Sentinel & Skeleton */}
                        {(hasMore || isLoadingMore) && (
                            <div ref={loadMoreRef} className="py-2 w-full">
                                {isLoadingMore ? (
                                    <div className="space-y-3">
                                        <KanbanCardSkeleton />
                                    </div>
                                ) : (
                                    <div className="h-4 w-full" /> // Invisible sentinel
                                )}
                            </div>
                        )}

                        {subTasks.length === 0 && !isLoadingMore && (
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
