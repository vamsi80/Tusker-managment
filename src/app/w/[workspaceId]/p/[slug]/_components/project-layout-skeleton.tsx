import { Skeleton } from "@/components/ui/skeleton";

export function ProjectLayoutSkeleton() {
    return (
        <div className="flex flex-col gap-6 pb-3 px-3 h-full">
            <div>
                <Skeleton className="h-10 w-64 mb-2" />
                <Skeleton className="h-4 w-80" />
            </div>

            {/* Nav skeleton */}
            <div className="border-b">
                <div className="flex h-10 items-center gap-4">
                    <Skeleton className="h-8 w-24" />
                    <Skeleton className="h-8 w-20" />
                    <Skeleton className="h-8 w-24" />
                </div>
            </div>

            {/* Content skeleton */}
            <div className="flex-1 space-y-4">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-64 w-full" />
            </div>
        </div>
    );
}
