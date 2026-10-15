"use client";

import { useDroppable, useDndContext } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";

import type { KanbanSubTaskType } from "@tusker/core/types/task";
import { cn } from "@/lib/utils";
import { KanbanCard } from "./kanban-card";
import { KanbanCardSkeleton } from "./kanban-skeleton";
import { useInView } from "react-intersection-observer";
import React, { useEffect } from "react";
import { Plus } from "lucide-react";
import { UserPermissionsType } from "@/data/user/get-user-permissions";
import { ProjectOption } from "../shared/types";


type TaskStatus = "TO_DO" | "IN_PROGRESS" | "REVIEW" | "HOLD" | "COMPLETED" | "CANCELLED";

interface KanbanColumnProps {
    column: {
        id: TaskStatus;
        title: string;
        color: string;
        bgColor: string;
        borderColor: string;
    };
    tasks: KanbanSubTaskType[];
    totalCount: number;
    hasMore: boolean;
    isLoadingMore: boolean;
    onSubTaskClick: (subTask: KanbanSubTaskType) => void;
    onLoadMore: () => void;
    projectManagers?: Record<string, any>;
    updatingTaskIds?: Set<string>;
    /** The id of the card currently being dragged */
    activeTaskId?: string | null;
    /** The id of the card the dragged item is hovering over (null = column itself is hovered, empty) */
    overCardId?: string | null;
    /** Whether the dragged item is over this column at all */
    isOverColumn?: boolean;
    permissions?: UserPermissionsType;
    userId?: string;
    projectMembers?: any[];
    projects?: ProjectOption[];
    projectMap?: Record<string, ProjectOption>;
    isMobile?: boolean;
    onStatusChange?: (subTaskId: string, newStatus: TaskStatus, currentStatus: TaskStatus) => void;
}

/**
 * Kanban Column Component
 * Optimized with virtualization and normalized data flow.
 * Includes ClickUp-style drop indicator showing where the card will land.
 */
export const KanbanColumn = React.memo(function KanbanColumn({
    column,
    tasks,
    totalCount,
    hasMore,
    isLoadingMore,
    onSubTaskClick,
    onLoadMore,
    projectManagers,
    updatingTaskIds = new Set(),
    activeTaskId,
    overCardId,
    isOverColumn = false,
    permissions,
    userId,
    projectMembers = [],
    projects,
    projectMap,
    isMobile,
    onStatusChange,
}: KanbanColumnProps) {
    const { setNodeRef, isOver } = useDroppable({
        id: column.id,
    });

    const { active } = useDndContext();
    const isDragging = !!active;

    const { ref: loadMoreRef, inView } = useInView({
        threshold: 0,
        rootMargin: '100px',
    });


    useEffect(() => {
        if (inView && hasMore && !isLoadingMore) {
            onLoadMore();
        }
    }, [inView, hasMore, isLoadingMore, onLoadMore]);

    /**
     * Compute where the drop indicator should appear.
     * - dropIndicatorIndex = the index BEFORE which the card will be inserted.
     * - If overCardId is null but isOverColumn → dropped on empty column or below all cards → index = tasks.length
     * - If overCardId is a card id → indicator appears BEFORE that card's index.
     */
    const getDropIndicatorIndex = (): number | null => {
        if (!isDragging || !isOverColumn) return null;
        if (!overCardId) {
            // Hovering the column itself (no card below cursor) → insert at bottom
            return tasks.length;
        }
        const idx = tasks.findIndex(t => t.id === overCardId);
        if (idx === -1) return null;
        return idx;
    };

    const dropIndicatorIndex = getDropIndicatorIndex();

    return (
        <div
            ref={setNodeRef}
            className={cn(
                "flex-shrink-0 w-[calc(100vw-4rem)] sm:w-80 flex flex-col h-full transition-all duration-200 rounded-2xl overflow-hidden border-2 shadow-xs",
                isOver ? "bg-accent ring-2 ring-primary/20 scale-[1.01] border-primary/50" : "bg-white border-transparent dark:bg-card"
            )}
        >
            {/* Column Header */}
            <div
                className="m-2 mb-0 rounded-full border bg-white px-4 py-2 dark:bg-card"
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                        {/* The status colour survives as a small bar before the title. */}
                        <span className={cn("h-4 w-1 shrink-0 rounded-full bg-current", column.color)} />
                        <h3 className="font-medium text-sm truncate">
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
                                    "size-2.5 transition-colors",
                                    isOver ? "text-primary" : "text-muted-foreground/60"
                                )} />
                                <span className={cn(
                                    "text-[8px] font-bold uppercase tracking-tight transition-colors",
                                    isOver ? "text-primary" : "text-muted-foreground/60"
                                )}>
                                    {isOver ? "Release" : "Drop Here"}
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
                    items={tasks.map(t => t.id)}
                    strategy={verticalListSortingStrategy}
                >
                    {/* Non-virtualized rendering with drop indicators */}
                    <div className="relative space-y-0">
                        {tasks.map((task, index) => {
                            const showIndicatorBefore = dropIndicatorIndex === index && task.id !== activeTaskId;
                            return (
                                <React.Fragment key={task.id}>
                                    {/* Drop Indicator BEFORE this card */}
                                    {showIndicatorBefore && (
                                        <DropIndicator />
                                    )}
                                    <div className="pb-3">
                                        <div className={cn("transition-opacity duration-150", isDragging && task.id === activeTaskId && "opacity-30")}>
                                            <KanbanCard
                                                subTask={task}
                                                columnColor={column.color}
                                                onSubTaskClick={onSubTaskClick}
                                                projectManagers={projectManagers}
                                                isUpdating={updatingTaskIds.has(task.id)}
                                                permissions={permissions}
                                                userId={userId}
                                                projectMembers={projectMembers}
                                                projects={projects}
                                                projectMap={projectMap}
                                                isMobile={isMobile}
                                                onStatusChange={onStatusChange}
                                            />
                                        </div>
                                    </div>
                                </React.Fragment>
                            );
                        })}

                        {/* Drop indicator at bottom of list */}
                        {dropIndicatorIndex === tasks.length && (
                            <DropIndicator />
                        )}

                        {/* Load more / skeleton */}
                        {(hasMore || isLoadingMore) ? (
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
                            tasks.length > 0 && (
                                <div className="py-6 flex flex-col items-center justify-center gap-2 opacity-40 group/nomore select-none">
                                    <div className="h-px w-8 bg-muted-foreground/30 group-hover/nomore:w-12 transition-all duration-500" />
                                    <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-muted-foreground whitespace-nowrap">
                                        No more tasks
                                    </span>
                                    <div className="h-px w-8 bg-muted-foreground/30 group-hover/nomore:w-12 transition-all duration-500" />
                                </div>
                            )
                        )}
                    </div>

                    {tasks.length === 0 && !isLoadingMore && (
                        <div className={cn(
                            "flex items-center justify-center h-24 text-foreground text-sm uppercase font-medium tracking-wide rounded-xl transition-all duration-200",
                            isOver
                                ? "bg-primary/10 border-2 border-dashed border-primary/40 text-primary scale-[1.02]"
                                : ""
                        )}>
                            {isOver ? "Drop here" : "No tasks found"}
                        </div>
                    )}
                </SortableContext>
            </div>
        </div>
    );
});

/**
 * A ClickUp-style animated drop indicator line shown between cards during drag.
 */
function DropIndicator() {
    return (
        <div className="relative py-1 mb-1 pointer-events-none select-none">
            {/* Outer glow bar */}
            <div className="relative flex items-center gap-1.5">
                {/* Circle handle */}
                <div className="size-2.5 rounded-full bg-primary border-2 border-background shadow-md shadow-primary/40 shrink-0 animate-pulse" />
                {/* Line */}
                <div
                    className="flex-1 h-0.5 rounded-full bg-primary shadow-[0_0_6px_2px_hsl(var(--primary)/0.4)]"
                    style={{
                        animation: "dropIndicatorPulse 1.2s ease-in-out infinite",
                    }}
                />
            </div>
        </div>
    );
}

// Inline keyframe for the indicator glow pulse
// We inject it once via a style tag approach in CSS-in-JS fashion
if (typeof document !== "undefined") {
    const styleId = "__kanban_drop_indicator_style";
    if (!document.getElementById(styleId)) {
        const style = document.createElement("style");
        style.id = styleId;
        style.textContent = `
            @keyframes dropIndicatorPulse {
                0%, 100% { opacity: 1; box-shadow: 0 0 6px 2px hsl(var(--primary) / 0.4); }
                50% { opacity: 0.75; box-shadow: 0 0 10px 4px hsl(var(--primary) / 0.6); }
            }
        `;
        document.head.appendChild(style);
    }
}
