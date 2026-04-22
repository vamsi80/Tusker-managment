import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface GanttRowSkeletonProps {
    className?: string;
    showRightPanel?: boolean;
}

export const GanttRowSkeleton = React.forwardRef<HTMLDivElement, GanttRowSkeletonProps>(
    ({ className, showRightPanel = true }, ref) => {
        return (
            <div
                ref={ref}
                className={cn(
                    "grid",
                    "border-b border-neutral-200 dark:border-neutral-800",
                    className
                )}
                style={{ gridTemplateColumns: 'var(--gantt-sidebar-width) var(--gantt-total-width)' }}
            >
                {/* Left Panel Sidebar */}
                <div className="sticky left-0 z-30 shrink-0 bg-white dark:bg-neutral-900 border-r border-neutral-200 dark:border-neutral-700 flex items-center px-3 py-1.5 gap-3">
                    <Skeleton className="h-4 w-4 rounded shrink-0 opacity-40" />
                    <Skeleton className="h-4 w-[140px] opacity-40" />
                    <div className="flex-1" />
                    <Skeleton className="h-3 w-8 opacity-20" />
                </div>

                {/* Right Panel Timeline */}
                {showRightPanel && (
                    <div className="relative min-h-[32px] w-full bg-white dark:bg-neutral-900 flex items-center px-8">
                        <Skeleton className="h-4 w-[20%] rounded-full opacity-10 ml-[15%]" />
                    </div>
                )}
            </div>
        );
    }
);

GanttRowSkeleton.displayName = "GanttRowSkeleton";
