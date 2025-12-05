import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading UI for the Workspace Page
 * Shows instantly during navigation
 */
export default function WorkspacePageLoading() {
    return (
        <div className="space-y-6">
            {/* Header skeleton */}
            <Skeleton className="h-8 w-64" />

            {/* Content skeleton */}
            <div className="space-y-4">
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-32 w-full" />
            </div>
        </div>
    );
}
