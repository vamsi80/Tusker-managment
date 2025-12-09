import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface GanttSkeletonProps {
    rows?: number;
}

export function GanttSkeleton({ rows = 10 }: GanttSkeletonProps) {
    return (
        <div className="flex flex-col h-full">
            {/* Toolbar Skeleton */}
            <div className="border-b p-4 bg-background">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <Skeleton className="h-9 w-[200px]" />
                        <Skeleton className="h-9 w-[150px]" />
                    </div>
                    <div className="flex items-center gap-2">
                        <Skeleton className="h-9 w-[100px]" />
                        <Skeleton className="h-9 w-[100px]" />
                    </div>
                </div>
            </div>

            {/* Gantt Chart Skeleton */}
            <div className="flex-1 overflow-hidden">
                <div className="flex h-full">
                    {/* Task List Skeleton */}
                    <div className="w-[400px] border-r bg-background">
                        {/* Header */}
                        <div className="border-b p-3 bg-muted/50">
                            <Skeleton className="h-5 w-32" />
                        </div>

                        {/* Task Rows */}
                        <div className="divide-y">
                            {Array.from({ length: rows }).map((_, i) => (
                                <div
                                    key={i}
                                    className={cn(
                                        "p-3 flex items-center gap-3",
                                        i % 3 === 0 && "bg-muted/20" // Simulate parent tasks
                                    )}
                                >
                                    {i % 3 !== 0 && <div className="w-4" />}
                                    <Skeleton className="h-4 w-4 rounded" />
                                    <div className="flex-1 space-y-2">
                                        <Skeleton
                                            className={cn(
                                                "h-4",
                                                i % 3 === 0 ? "w-48" : "w-40"
                                            )}
                                        />
                                        <Skeleton className="h-3 w-24" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Timeline Skeleton */}
                    <div className="flex-1 overflow-x-auto bg-background">
                        {/* Timeline Header */}
                        <div className="border-b p-3 bg-muted/50 flex gap-4">
                            {Array.from({ length: 12 }).map((_, i) => (
                                <Skeleton key={i} className="h-5 w-20" />
                            ))}
                        </div>

                        {/* Timeline Bars */}
                        <div className="divide-y">
                            {Array.from({ length: rows }).map((_, i) => (
                                <div
                                    key={i}
                                    className={cn(
                                        "p-3 flex items-center gap-4",
                                        i % 3 === 0 && "bg-muted/20"
                                    )}
                                >
                                    <Skeleton
                                        className="h-8 rounded"
                                        style={{
                                            width: `${Math.random() * 200 + 100}px`,
                                            marginLeft: `${Math.random() * 100}px`,
                                        }}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

/**
 * Minimal skeleton for instant rendering
 */
export function GanttMinimalSkeleton() {
    return (
        <div className="flex flex-col h-full animate-pulse">
            <div className="border-b p-4 bg-muted/20">
                <div className="h-9 bg-muted rounded w-full max-w-md" />
            </div>
            <div className="flex-1 flex">
                <div className="w-[400px] border-r bg-muted/10" />
                <div className="flex-1 bg-muted/5" />
            </div>
        </div>
    );
}
