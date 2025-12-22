import { Skeleton } from "@/components/ui/skeleton";

/**
 * Project Header Skeleton
 * 
 * Loading skeleton for the project header component.
 * Displays placeholder UI while the header data is being fetched.
 * 
 * Includes:
 * - Project title skeleton
 * - Description skeleton
 * - Action buttons skeleton (reload, bulk upload, create task)
 * - Navigation tabs skeleton
 */
export function ProjectHeaderSkeleton() {
    return (
        <>
            {/* Header Section */}
            <div className="flex items-center justify-between">
                {/* Title and Description */}
                <div className="space-y-2">
                    <Skeleton className="h-9 w-64" /> {/* Project title */}
                    <Skeleton className="h-4 w-48" /> {/* Description */}
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-3">
                    <Skeleton className="h-9 w-9" />   {/* Reload button */}
                    <Skeleton className="h-9 w-32" />  {/* Bulk upload button */}
                    <Skeleton className="h-9 w-32" />  {/* Create task button */}
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="border-b">
                <div className="flex h-10 items-center gap-4">
                    <Skeleton className="h-full w-28" /> {/* Dashboard tab */}
                    <Skeleton className="h-full w-20" /> {/* List tab */}
                    <Skeleton className="h-full w-24" /> {/* Kanban tab */}
                    <Skeleton className="h-full w-20" /> {/* Gantt tab */}
                </div>
            </div>
        </>
    );
}
