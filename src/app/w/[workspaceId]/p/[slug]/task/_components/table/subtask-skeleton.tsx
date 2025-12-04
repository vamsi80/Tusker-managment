import { TableCell, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ColumnVisibility } from "./task-table-toolbar";

interface SubTaskSkeletonProps {
    columnVisibility: ColumnVisibility;
    count?: number;
}

export function SubTaskSkeleton({ columnVisibility, count = 2 }: SubTaskSkeletonProps) {
    const visibleColumnsCount = 2 + Object.values(columnVisibility).filter(Boolean).length + 1;

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

                    {/* Assignee column */}
                    {columnVisibility.assignee && (
                        <TableCell>
                            <div className="flex items-center gap-2">
                                <Skeleton className="h-5 w-5 rounded-full" />
                                <Skeleton className="h-3 w-20" />
                            </div>
                        </TableCell>
                    )}

                    {/* Due date column */}
                    {columnVisibility.dueDate && (
                        <TableCell>
                            <div className="flex items-center gap-2">
                                <Skeleton className="h-3 w-3" />
                                <Skeleton className="h-3 w-16" />
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
