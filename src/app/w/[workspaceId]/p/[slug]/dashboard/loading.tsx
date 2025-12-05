import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading UI for the Dashboard Page
 * Shows instantly during navigation
 */
export default function DashboardPageLoading() {
    return (
        <div className="space-y-6">
            {/* Header skeleton */}
            <div className="flex items-center justify-between">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-10 w-32" />
            </div>

            {/* Stats cards skeleton */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="border rounded-lg p-4 space-y-2">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-8 w-16" />
                        <Skeleton className="h-3 w-24" />
                    </div>
                ))}
            </div>

            {/* Charts/content skeleton */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="border rounded-lg p-4">
                    <Skeleton className="h-6 w-32 mb-4" />
                    <Skeleton className="h-48 w-full" />
                </div>
                <div className="border rounded-lg p-4">
                    <Skeleton className="h-6 w-32 mb-4" />
                    <Skeleton className="h-48 w-full" />
                </div>
            </div>
        </div>
    );
}
