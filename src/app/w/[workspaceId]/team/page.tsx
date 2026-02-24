import { Suspense } from "react";

import { isAdminServer } from "@/lib/auth/requireAdmin";
import { TeamMembers } from "./_components/team-members-table";
import { TeamMembersSkeleton } from "./_components/team-members-skeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { getWorkspaceMembers } from "@/data/workspace";

interface TeamPageProps {
    params: Promise<{
        workspaceId: string;
    }>;
}

/**
 * Header skeleton for instant loading
 */
function TeamHeaderSkeleton() {
    return (
        <div className="flex items-center justify-between">
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-10 w-32" />
        </div>
    );
}

/**
 * Async component for the header with invite button
 * Wrapped in Suspense so page loads instantly
 */
async function TeamHeader({ workspaceId }: { workspaceId: string }) {
    return (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <h1 className="text-2xl font-bold leading-tight tracking-tighter md:text-3xl">
                Team Members
            </h1>
        </div>
    );
}

/**
 * Async component for team members list
 * Wrapped in Suspense with skeleton fallback
 */
async function TeamMembersList({ workspaceId }: { workspaceId: string }) {
    const [data, isAdmin] = await Promise.all([
        getWorkspaceMembers(workspaceId),
        isAdminServer(workspaceId),
    ]);
    return (
        <TeamMembers
            data={data.workspaceMembers}
            isAdmin={isAdmin}
            workspaceId={workspaceId}
        />
    );
}

/**
 * Team Page - Uses Progressive Loading Pattern
 * 
 * Navigation Flow:
 * 1. User clicks link → Page INSTANTLY shows with skeletons (~10ms)
 * 2. TeamHeader loads → Shows "Team Members" + Invite button
 * 3. TeamMembersList loads → Shows team members table
 * 
 * Result: Navigation feels INSTANT, data streams in progressively!
 */
export default async function TeamPage({ params }: TeamPageProps) {
    const { workspaceId } = await params;

    return (
        <div className="flex flex-col gap-5">
            {/* Header with invite button - loads independently */}
            <Suspense fallback={<TeamHeaderSkeleton />}>
                <TeamHeader workspaceId={workspaceId} />
            </Suspense>

            {/* Team members table - loads independently */}
            <Suspense fallback={<TeamMembersSkeleton />}>
                <TeamMembersList workspaceId={workspaceId} />
            </Suspense>
        </div>
    );
}

