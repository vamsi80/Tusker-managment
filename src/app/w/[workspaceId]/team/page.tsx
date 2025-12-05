import { Suspense } from "react";
import { InviteUserForm } from "./_components/create-user";
import { requireAdmin } from "@/lib/requireAdmin";
import { getWorkspaceMembers } from "@/app/data/workspace/get-workspace-members";
import { TeamMembers } from "./_components/team-members";
import { TeamMembersSkeleton } from "./_components/team-members-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

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
    const isAdmin = await requireAdmin(workspaceId);

    return (
        <div className="flex items-center justify-between">
            <h1 className="text-3xl font-semibold leading-tight tracking-tighter md:text-4xl">
                Team Members
            </h1>
            <InviteUserForm workspaceId={workspaceId} isAdmin={isAdmin} />
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
        requireAdmin(workspaceId),
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

