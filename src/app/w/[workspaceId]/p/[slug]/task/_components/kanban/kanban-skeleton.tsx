import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { ListFilter, User, Layers } from "lucide-react";

/**
 * Skeleton loader for individual Kanban card
 * Matches the exact structure of KanbanCard component
 */
export function KanbanCardSkeleton() {
    return (
        <Card className="border-l-4 border-l-slate-300">
            <CardContent className="p-4 space-y-3">
                {/* Parent Task Badge */}
                <div className="flex items-center gap-1.5">
                    <Layers className="h-3 w-3 text-muted-foreground" />
                    <Skeleton className="h-5 w-24 rounded-full" />
                </div>

                {/* Header with drag handle */}
                <div className="flex items-start justify-between gap-2">
                    <Skeleton className="h-5 w-full flex-1" />
                    <Skeleton className="h-4 w-4 flex-shrink-0 mt-0.5" />
                </div>

                {/* Description */}
                <Skeleton className="h-3 w-3/4" />

                {/* Tag */}
                <div className="flex items-center gap-1.5">
                    <Skeleton className="h-3 w-3" />
                    <Skeleton className="h-5 w-20 rounded-full" />
                </div>

                {/* Due Date */}
                <div className="flex items-center gap-1.5">
                    <Skeleton className="h-3 w-3" />
                    <Skeleton className="h-3 w-24" />
                </div>

                {/* Footer: Assignee */}
                <div className="flex items-center gap-2 pt-2 border-t">
                    <Skeleton className="h-6 w-6 rounded-full" />
                    <Skeleton className="h-3 w-20" />
                </div>
            </CardContent>
        </Card>
    );
}

/**
 * Skeleton loader for Kanban column
 * Matches the exact structure of DroppableColumn component
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

            {/* Column Content with individual scroll */}
            <div
                className={cn(
                    "flex-1 border-2 border-t-0 p-3 overflow-y-auto",
                    borderColor,
                    // Custom ultra-thin scrollbar
                    "[&::-webkit-scrollbar]:w-0.5",
                    "[&::-webkit-scrollbar-track]:bg-transparent",
                    "[&::-webkit-scrollbar-thumb]:bg-slate-300",
                    "[&::-webkit-scrollbar-thumb]:rounded-full",
                    "[&::-webkit-scrollbar-thumb]:hover:bg-slate-400"
                )}
            >
                <div className="space-y-3 min-h-[200px]">
                    <KanbanCardSkeleton />
                    <KanbanCardSkeleton />
                    <KanbanCardSkeleton />
                </div>
            </div>
        </div>
    );
}

/**
 * Skeleton loader for Kanban toolbar
 * Matches the exact structure of KanbanToolbar component
 */
export function KanbanToolbarSkeleton() {
    return (
        <div className="flex items-center justify-between gap-4 p-1 rounded-lg">
            <div className="flex items-center gap-3 flex-1">
                {/* Parent Task Filter */}
                <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-muted-foreground" />
                    <Skeleton className="w-[200px] h-9 rounded-md" />
                </div>

                {/* Assignee Filter */}
                <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <Skeleton className="w-[200px] h-9 rounded-md" />
                </div>
            </div>

            {/* Column Visibility */}
            <Skeleton className="h-9 w-32 rounded-md" />
        </div>
    );
}

/**
 * Full Kanban board skeleton loader
 * Shows toolbar and all columns with skeleton cards for instant perceived performance
 * Matches the exact structure of KanbanBoard component
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
            <KanbanToolbarSkeleton />

            {/* Board Skeleton */}
            <div
                className={cn(
                    "flex gap-4 h-[calc(100vh-280px)] overflow-x-auto pb-2",
                    // Custom horizontal scrollbar - bigger than vertical
                    "[&::-webkit-scrollbar]:h-2",
                    "[&::-webkit-scrollbar-track]:rounded-full",
                    "[&::-webkit-scrollbar-thumb]:bg-accent",
                    "[&::-webkit-scrollbar-thumb]:rounded-full",
                    "[&::-webkit-scrollbar-thumb]:hover:bg-accent/50"
                )}
            >
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
