import React from "react";
import { TableRow, TableCell } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useLoadMoreSentinel } from "@/hooks/use-load-more-sentinel";

interface LoadMoreSentinelProps {
    visibleColumnsCount: number;
    projectId?: string;
    onLoadMore?: () => void;
    hasMore?: boolean;
    isLoading?: boolean;
}

export function LoadMoreSentinel({ 
    visibleColumnsCount, 
    projectId, 
    onLoadMore, 
    hasMore = true, 
    isLoading = false 
}: LoadMoreSentinelProps) {
    const ref = useLoadMoreSentinel<HTMLTableRowElement>({
        onLoadMore: onLoadMore || (() => {}),
        hasMore,
        isLoading,
    });

    return (
        <TableRow
            ref={ref}
            data-project-id={projectId}
            className="hover:bg-transparent border-0"
        >
            <TableCell colSpan={visibleColumnsCount} className="py-2 h-10">
                <div className="flex items-center gap-4 px-2 opacity-60">
                    <Skeleton className="h-4 w-4 rounded" />
                    <div className="flex-1">
                        <Skeleton className="h-4 w-[150px]" />
                    </div>
                    <Skeleton className="h-4 w-[100px]" />
                </div>
            </TableCell>
        </TableRow>
    );
}

LoadMoreSentinel.displayName = "LoadMoreSentinel";
