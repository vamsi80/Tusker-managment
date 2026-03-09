"use client";

import { useDroppable, useDndContext } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";

import type { KanbanSubTaskType } from "@/data/task";
import { cn } from "@/lib/utils";
import { KanbanCard } from "./kanban-card";
import { KanbanCardSkeleton } from "./kanban-skeleton";
import { useInView } from "react-intersection-observer";
import React, { useEffect } from "react";
import { Plus } from "lucide-react";

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
    projectManagers?: Record<string, any>;
    updatingTaskIds?: Set<string>;
}

/**
 * Kanban Column Component
 * ...
 */
export const KanbanColumn = React.memo(function KanbanColumn({
    column,
    subTasks,
    totalCount,
    hasMore,
    isLoadingMore,
    onSubTaskClick,
    onLoadMore,
    projectManagers,
    updatingTaskIds = new Set()
}: KanbanColumnProps) {
    const { setNodeRef, isOver } = useDroppable({
        id: column.id,
    });

    const { active } = useDndContext();
    const isDragging = !!active;

    const { ref: loadMoreRef, inView } = useInView({
        threshold: 0,
        rootMargin: '100px', // Trigger before hitting bottom slightly
    });

    useEffect(() => {
        if (inView && hasMore && !isLoadingMore) {
            onLoadMore();
        }
    }, [inView, hasMore, isLoadingMore, onLoadMore]);

    const deduplicatedSubTasks = Array.from(
        new Map(subTasks.map((t) => [t.id, t])).values()
    );

    return (
        <div
            ref={setNodeRef}
            className={cn(
                "flex-shrink-0 w-[calc(100vw-4rem)] sm:w-80 flex flex-col h-full transition-all duration-200 rounded-lg overflow-hidden border-2",
                isOver ? "bg-primary/5 ring-2 ring-primary/20 scale-[1.01] border-primary/50" : "bg-transparent border-transparent"
            )}
        >
            {/* Column Header */}
            <div
                className={cn(
                    "border-b p-4",
                    column.borderColor,
                    column.bgColor
                )}
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                        <h3 className={cn("font-semibold text-sm truncate", column.color)}>
                            {column.title}
                        </h3>
                        {isDragging && (
                            <div className={cn(
                                "border-2 border-dashed rounded-full px-2 py-0.5 flex items-center gap-1 transition-all duration-300 animate-in fade-in zoom-in-95 shrink-0",
                                isOver
                                    ? "border-primary/50 bg-primary/20 scale-105 shadow-sm"
                                    : "border-muted-foreground/20 bg-muted/10 opacity-70"
                            )}>
                                <Plus className={cn(
                                    "h-2.5 w-2.5 transition-colors",
                                    isOver ? "text-primary" : "text-muted-foreground/60"
                                )} />
                                <span className={cn(
                                    "text-[8px] font-bold uppercase tracking-tight transition-colors",
                                    isOver ? "text-primary" : "text-muted-foreground/60"
                                )}>
                                    {isOver ? "Release" : "Drop Top"}
                                </span>
                            </div>
                        )}
                    </div>

                </div>
            </div>

            {/* Column Content with individual scroll */}
            <div
                className={cn(
                    "flex-1 p-3 overflow-y-auto",
                    !isOver && "border-t-0",
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
                    items={deduplicatedSubTasks.map((t) => t.id)}
                    strategy={verticalListSortingStrategy}
                >
                    <div className="space-y-3 min-h-[100px]">
                        <div className="flex flex-col gap-2 min-h-[50px]">
                            {deduplicatedSubTasks.map((subTask) => (
                                <KanbanCard
                                    key={subTask.id}
                                    subTask={subTask}
                                    columnColor={column.color}
                                    onSubTaskClick={onSubTaskClick}
                                    projectManagers={projectManagers}
                                    isUpdating={updatingTaskIds.has(subTask.id)}
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

                            {deduplicatedSubTasks.length === 0 && !isLoadingMore && (
                                <div className="flex items-center justify-center h-24 text-muted-foreground text-xs uppercase font-medium tracking-wider border-2 border-dashed rounded-lg bg-muted/20">
                                    No subtasks
                                </div>
                            )}

                            {/* Visual Drop Zone at the bottom */}
                            {/* <div className={cn(
                                "group border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center gap-2 transition-all duration-300",
                                isOver
                                    ? "border-primary/50 bg-primary/10 scale-95 shadow-inner"
                                    : "border-muted-foreground/10 bg-muted/5 opacity-40 hover:opacity-100"
                            )}>
                                <div className={cn(
                                    "p-2 rounded-full border-2 border-dashed transition-colors",
                                    isOver ? "border-primary text-primary bg-background" : "border-muted-foreground/20 text-muted-foreground"
                                )}>
                                    <Plus className="h-5 w-5" />
                                </div>
                                <span className={cn(
                                    "text-[10px] font-bold uppercase tracking-widest transition-colors",
                                    isOver ? "text-primary" : "text-muted-foreground/60"
                                )}>
                                    {isOver ? "Release to Move" : "Drop here"}
                                </span>
                            </div> */}
                        </div>
                    </div>
                </SortableContext>
            </div>
        </div>
    );
});
