import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Skeleton loader for individual Kanban card
 */
export function KanbanCardSkeleton() {
    return (
        <div className="bg-white rounded-lg border p-4 space-y-3 shadow-sm">
            {/* Header with pin indicator */}
            <div className="flex items-start justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-4 rounded-full" />
            </div>

            {/* Title */}
            <Skeleton className="h-5 w-full" />

            {/* Description */}
            <Skeleton className="h-3 w-3/4" />

            {/* Footer with assignee and tag */}
            <div className="flex items-center justify-between pt-2">
                <Skeleton className="h-6 w-6 rounded-full" />
                <Skeleton className="h-5 w-16 rounded-full" />
            </div>
        </div>
    );
}

/**
 * Skeleton loader for Kanban column
 */
export function KanbanColumnSkeleton({
    title,
    color,
    bgColor,
    borderColor
}: {
    title: string;
    color: string;
    bgColor: string;
    borderColor: string;
}) {
    return (
        <div className="flex-shrink-0 w-80 flex flex-col h-full">
            {/* Column Header */}
            <div
                className={cn(
                    "border-2 border-b p-4",
                    borderColor,
                    bgColor
                )}
            >
                <div className="flex items-center justify-between">
                    <h3 className={cn("font-semibold text-sm", color)}>
                        {title}
                    </h3>
                    <Skeleton className="h-5 w-8 rounded-full" />
                </div>
            </div>

            {/* Column Content */}
            <div
                className={cn(
                    "flex-1 border-2 border-t-0 p-3 overflow-y-auto",
                    borderColor
                )}
            >
                <div className="space-y-3">
                    <KanbanCardSkeleton />
                    <KanbanCardSkeleton />
                    <KanbanCardSkeleton />
                </div>
            </div>
        </div>
    );
}

/**
 * Full Kanban board skeleton loader
 * Shows all columns with skeleton cards for instant perceived performance
 */
export function KanbanBoardSkeleton() {
    const columns = [
        {
            title: "To Do",
            color: "text-slate-700",
            bgColor: "bg-slate-50",
            borderColor: "border-slate-200",
        },
        {
            title: "In Progress",
            color: "text-blue-700",
            bgColor: "bg-blue-50",
            borderColor: "border-blue-200",
        },
        {
            title: "Review",
            color: "text-amber-700",
            bgColor: "bg-amber-50",
            borderColor: "border-amber-200",
        },
    ];

    return (
        <div className="space-y-4">
            {/* Toolbar Skeleton */}
            <div className="flex items-center justify-between gap-4 p-4 bg-white rounded-lg border">
                <div className="flex items-center gap-2">
                    <Skeleton className="h-10 w-48" />
                    <Skeleton className="h-10 w-48" />
                </div>
                <Skeleton className="h-10 w-32" />
            </div>

            {/* Board Skeleton */}
            <div className="flex gap-4 h-[calc(100vh-280px)] overflow-x-auto pb-2">
                {columns.map((column, index) => (
                    <KanbanColumnSkeleton
                        key={index}
                        title={column.title}
                        color={column.color}
                        bgColor={column.bgColor}
                        borderColor={column.borderColor}
                    />
                ))}
            </div>
        </div>
    );
}
