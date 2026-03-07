import { Skeleton } from "@/components/ui/skeleton";

/**
 * Mobile-responsive header + nav-tab skeleton.
 * Shown inside layout.tsx while ProjectHeader data loads.
 */
export function ProjectHeaderSkeleton() {
    return (
        <>
            {/* Header: title + action buttons */}
            <div className="flex items-start sm:items-center justify-between gap-3">
                <div className="space-y-1.5 min-w-0">
                    <Skeleton className="h-7 sm:h-9 w-40 sm:w-64" />
                    <Skeleton className="h-3 w-28 sm:w-48" />
                </div>
                <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
                    <Skeleton className="h-8 sm:h-9 w-8 sm:w-9 rounded-md" />
                    <Skeleton className="hidden sm:block h-9 w-28 rounded-md" />
                    <Skeleton className="h-8 sm:h-9 w-20 sm:w-32 rounded-md" />
                </div>
            </div>

            {/* Navigation tabs */}
            <div className="border-b border-neutral-200 dark:border-neutral-700">
                <div className="flex h-9 sm:h-10 items-end gap-1 overflow-hidden">
                    <Skeleton className="h-7 sm:h-8 w-20 sm:w-28 rounded-t-md rounded-b-none shrink-0" />
                    <Skeleton className="h-6 sm:h-7 w-12 sm:w-20 rounded-t-md rounded-b-none shrink-0" />
                    <Skeleton className="h-6 sm:h-7 w-16 sm:w-24 rounded-t-md rounded-b-none shrink-0" />
                    <Skeleton className="h-6 sm:h-7 w-12 sm:w-20 rounded-t-md rounded-b-none shrink-0" />
                </div>
            </div>
        </>
    );
}
