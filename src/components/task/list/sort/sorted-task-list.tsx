"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { TableRow, TableCell } from "@/components/ui/table";
import { Loader2 } from "lucide-react";
import { SortedTaskRow } from "./sorted-task-row";
import { SingleTableSkeleton } from "../table/table-skeleton";
import { EmptyState } from "../table/empty-state";
import { ColumnVisibility } from "../../shared/column-visibility";

interface SortedTaskListProps {
    sortedTasks: any[];
    isLoading: boolean;
    hasMore: boolean;
    isLoadingMore: boolean;
    columnVisibility: ColumnVisibility;
    visibleColumnsCount: number;
    onLoadMore: () => void;
    handleSubTaskClick: (task: any) => void;
}

export function SortedTaskList({
    sortedTasks,
    isLoading,
    hasMore,
    isLoadingMore,
    columnVisibility,
    visibleColumnsCount,
    onLoadMore,
    handleSubTaskClick,
}: SortedTaskListProps) {
    // 1. Local optimistic state for instant UI deletion (without waiting for TaskTable re-render)
    const [localTasks, setLocalTasks] = useState(sortedTasks);
    const sentinelRef = useRef<HTMLTableRowElement | null>(null);
    const onLoadMoreRef = useRef(onLoadMore);

    // Keep the callback ref current
    useEffect(() => {
        onLoadMoreRef.current = onLoadMore;
    }, [onLoadMore]);

    // Sync upstream on actual updates
    useEffect(() => {
        setLocalTasks(sortedTasks);
    }, [sortedTasks]);

    // IntersectionObserver lives here — guaranteed DOM access to sentinel
    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel || !hasMore) return;

        const obs = new IntersectionObserver(
            (entries) => {
                if (entries[0]?.isIntersecting) {
                    onLoadMoreRef.current();
                }
            },
            { rootMargin: "300px", threshold: 0 },
        );

        obs.observe(sentinel);
        return () => obs.disconnect();
    }, [localTasks.length, hasMore]);

    if (isLoading) {
        return <SingleTableSkeleton visibleColumnsCount={visibleColumnsCount} />;
    }

    if (localTasks.length === 0) {
        return <EmptyState visibleColumnsCount={visibleColumnsCount} />;
    }

    return (
        <>
            {localTasks.map((task: any) => (
                <SortedTaskRow
                    key={task.id}
                    task={task}
                    columnVisibility={columnVisibility}
                    onClick={() => handleSubTaskClick(task)}
                />
            ))}

            {/* Sentinel — always mounted so the observer can re-attach */}
            <TableRow
                className="hover:bg-transparent border-0"
                ref={sentinelRef}
            >
                <TableCell colSpan={visibleColumnsCount} className="py-3">
                    {isLoadingMore && (
                        <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Loading more...</span>
                        </div>
                    )}
                </TableCell>
            </TableRow>
        </>
    );
}
