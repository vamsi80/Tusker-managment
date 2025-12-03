import { Skeleton } from "@/components/ui/skeleton";

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
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-4 w-24" />
                    </div>

                    {/* Table rows */}
                    {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="flex items-center gap-4 py-3">
                            <Skeleton className="h-8 w-8" />
                            <Skeleton className="h-6 w-64" />
                            <Skeleton className="h-6 w-32" />
                            <Skeleton className="h-6 w-32" />
                            <Skeleton className="h-6 w-24" />
                            <Skeleton className="h-8 w-8" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
