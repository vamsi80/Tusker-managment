"use client";

import { useDroppable, useDndContext } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";

import type { KanbanSubTaskType } from "@/data/task";
import { cn } from "@/lib/utils";
import { KanbanCard } from "./kanban-card";
import { KanbanCardSkeleton } from "./kanban-skeleton";
import { useInView } from "react-intersection-observer";
import React, { useEffect, useRef } from "react";
import { Plus } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";

type TaskStatus = "TO_DO" | "IN_PROGRESS" | "REVIEW" | "HOLD" | "COMPLETED" | "CANCELLED";

interface KanbanColumnProps {
    column: {
        id: TaskStatus;
        title: string;
        color: string;
        bgColor: string;
        borderColor: string;
    };
    subTaskIds: string[];
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
 * Optimized with virtualization and normalized data flow.
 */
export const KanbanColumn = React.memo(function KanbanColumn({
    column,
    subTaskIds,
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

    const parentRef = useRef<HTMLDivElement>(null);

    const virtualizer = useVirtualizer({
        count: subTaskIds.length + (hasMore || isLoadingMore ? 1 : 0),
        getScrollElement: () => parentRef.current,
        estimateSize: () => 140, // Estimated card height with space
        overscan: 10,
    });

    const virtualItems = virtualizer.getVirtualItems();

    useEffect(() => {
        if (inView && hasMore && !isLoadingMore) {
            onLoadMore();
        }
    }, [inView, hasMore, isLoadingMore, onLoadMore]);

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
                ref={parentRef}
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
                    items={subTaskIds}
                    strategy={verticalListSortingStrategy}
                >
                    <div
                        style={{
                            height: `${virtualizer.getTotalSize()}px`,
                            width: '100%',
                            position: 'relative',
                        }}
                    >
                        {virtualItems.map((virtualItem) => {
                            const isLoader = virtualItem.index >= subTaskIds.length;
                            const subTaskId = subTaskIds[virtualItem.index];

                            return (
                                <div
                                    key={virtualItem.key}
                                    data-index={virtualItem.index}
                                    ref={virtualizer.measureElement}
                                    style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        width: '100%',
                                        transform: `translateY(${virtualItem.start}px)`,
                                        paddingBottom: '12px', // space-y-3 equivalent
                                    }}
                                >
                                    {isLoader ? (
                                        <div ref={loadMoreRef} className="py-2 w-full">
                                            {isLoadingMore ? (
                                                <div className="space-y-3">
                                                    <KanbanCardSkeleton />
                                                </div>
                                            ) : (
                                                <div className="h-4 w-full" />
                                            )}
                                        </div>
                                    ) : (
                                        <KanbanCardWrapper
                                            id={subTaskId}
                                            columnColor={column.color}
                                            onSubTaskClick={onSubTaskClick}
                                            projectManagers={projectManagers}
                                            isUpdating={updatingTaskIds.has(subTaskId)}
                                        />
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {subTaskIds.length === 0 && !isLoadingMore && (
                        <div className="flex items-center justify-center h-24 text-muted-foreground text-xs uppercase font-medium tracking-wider border-2 border-dashed rounded-lg bg-muted/20">
                            No tasks found
                        </div>
                    )}

                    {subTaskIds.length > 0 && !hasMore && !isLoadingMore && (
                        <div className="flex items-center justify-center py-6 text-muted-foreground text-xs font-medium tracking-wider">
                            No tasks found
                        </div>
                    )}
                </SortableContext>
            </div>
        </div>
    );
});

import { useTaskCacheStore } from "@/lib/store/task-cache-store";

const KanbanCardWrapper = React.memo(function KanbanCardWrapper({
    id,
    ...props
}: {
    id: string;
    columnColor: string;
    onSubTaskClick: (subTask: KanbanSubTaskType) => void;
    projectManagers?: Record<string, any>;
    isUpdating: boolean;
}) {
    const subTask = useTaskCacheStore(state => state.entities[id]);
    if (!subTask) return null;

    return (
        <KanbanCard
            subTask={subTask as KanbanSubTaskType}
            {...props}
        />
    );
});
