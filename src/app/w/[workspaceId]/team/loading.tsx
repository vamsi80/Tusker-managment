import { Skeleton } from "@/components/ui/skeleton";
import { TeamMembersSkeleton } from "./_components/team-members-skeleton";

/**
 * Loading UI for the Team Page
 * 
 * This file is automatically used by Next.js during navigation.
 * When a user clicks a link to this page, this loading UI shows INSTANTLY
 * while the actual page content loads in the background.
 * 
 * Result: Navigation feels instant, no blank screen!
 */
export default function TeamPageLoading() {
    return (
        <div className="flex flex-col gap-5">
            {/* Header skeleton */}
            <div className="flex items-center justify-between">
                <Skeleton className="h-10 w-48" />
                <Skeleton className="h-10 w-32" />
            </div>

            {/* Team members table skeleton */}
            <TeamMembersSkeleton />
        </div>
    );
}
