import { Skeleton } from "@/components/ui/skeleton";
import { TableCell, TableRow } from "@/components/ui/table";
import { ColumnVisibility } from "../list/task-table-toolbar";

interface SubTaskSkeletonProps {
    columnVisibility: ColumnVisibility;
    count?: number;
}

export function TaskHeaderSkeleton() {
    return (
        <div className="flex items-center justify-between">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-10 w-36" />
        </div>
    );
}

export function TaskTableSkeleton() {
    return (
        <div className="space-y-4">
            {/* Filters and controls */}
            <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-80" />
                <Skeleton className="h-10 w-32" />
                <Skeleton className="h-10 w-28" />
            </div>

            {/* Table skeleton */}
            <div className="rounded-md border mt-4">
                <div className="p-4 space-y-3">
                    {/* Table header */}
                    <div className="flex items-center gap-4 pb-3 border-b">
                        <Skeleton className="h-4 w-12" />
                        <Skeleton className="h-4 w-64" />
                        <Skeleton className="h-4 w-40" />
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-4 w-24" />
                    </div>

                    {/* Table rows */}
                    {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="flex items-center gap-4 py-3">
                            <Skeleton className="h-8 w-8" />
                            <Skeleton className="h-6 w-64" />
                            <Skeleton className="h-6 w-40" />
                            <Skeleton className="h-6 w-32" />
                            <Skeleton className="h-6 w-28" />
                            <Skeleton className="h-6 w-28" />
                            <Skeleton className="h-6 w-24" />
                            <Skeleton className="h-6 w-24" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

export function SubTaskSkeleton({ columnVisibility, count = 2 }: SubTaskSkeletonProps) {

    return (
        <>
            {Array.from({ length: count }).map((_, index) => (
                <TableRow key={index} className="bg-muted/10">

                    {/* Drag handle column */}
                    <TableCell className="pl-4">
                        <Skeleton className="h-6 w-6" />
                    </TableCell>

                    {/* Task name column with indent icon */}
                    <TableCell className="pl-3">
                        <div className="flex items-center gap-2">
                            <Skeleton className="h-4 w-4 shrink-0" />
                            <Skeleton className="h-4 w-48" />
                        </div>
                    </TableCell>

                    {/* Description column */}
                    {columnVisibility.description && (
                        <TableCell>
                            <Skeleton className="h-4 w-32" />
                        </TableCell>
                    )}

                    {/* Assignee column */}
                    {columnVisibility.assignee && (
                        <TableCell>
                            <div className="flex items-center gap-2">
                                <Skeleton className="h-5 w-5 rounded-full" />
                                <Skeleton className="h-3 w-20" />
                            </div>
                        </TableCell>
                    )}

                    {/* Start Date column */}
                    {columnVisibility.startDate && (
                        <TableCell>
                            <div className="flex items-center gap-2">
                                <Skeleton className="h-3 w-3" />
                                <Skeleton className="h-3 w-16" />
                            </div>
                        </TableCell>
                    )}

                    {/* Due Date column */}
                    {columnVisibility.dueDate && (
                        <TableCell>
                            <div className="flex items-center gap-2">
                                <Skeleton className="h-3 w-3" />
                                <Skeleton className="h-3 w-16" />
                            </div>
                        </TableCell>
                    )}

                    {/* Progress column */}
                    {columnVisibility.progress && (
                        <TableCell>
                            <div className="flex items-center gap-2">
                                <Skeleton className="h-3 w-3 rounded-full" />
                                <Skeleton className="h-3 w-12" />
                            </div>
                        </TableCell>
                    )}

                    {/* Tag column */}
                    {columnVisibility.tag && (
                        <TableCell>
                            <div className="flex items-center gap-1">
                                <Skeleton className="h-3 w-3" />
                                <Skeleton className="h-3 w-12" />
                            </div>
                        </TableCell>
                    )}

                    {/* Actions column */}
                    <TableCell>
                        <Skeleton className="h-7 w-7" />
                    </TableCell>
                </TableRow>
            ))}
        </>
    );
}
