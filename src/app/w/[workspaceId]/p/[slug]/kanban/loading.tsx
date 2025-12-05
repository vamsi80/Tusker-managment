import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading UI for the Kanban Page
 * Shows instantly during navigation
 */
export default function KanbanPageLoading() {
    return (
        <div className="space-y-4">
            {/* Header skeleton */}
            <div className="flex items-center justify-between">
                <Skeleton className="h-8 w-40" />
                <Skeleton className="h-10 w-32" />
            </div>

            {/* Kanban board skeleton */}
            <div className="flex gap-4 overflow-x-auto pb-4">
                {[1, 2, 3, 4].map((col) => (
                    <div key={col} className="flex-shrink-0 w-72">
                        <Skeleton className="h-10 w-full mb-3 rounded-lg" />
                        <div className="space-y-3">
                            {[1, 2, 3].map((card) => (
                                <Skeleton key={card} className="h-24 w-full rounded-lg" />
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
