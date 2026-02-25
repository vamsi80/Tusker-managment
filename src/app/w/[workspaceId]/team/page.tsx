import { Suspense } from "react";
import { isAdminServer } from "@/lib/auth/requireAdmin";
import { TeamMembers } from "./_components/team-members-table";
import { TeamPageSkeleton, TeamPageSkeleton as TeamMembersSkeletonFallback } from "@/components/shared/workspace-skeletons";
import { getWorkspaceMembers } from "@/data/workspace";

interface TeamPageProps {
    params: Promise<{ workspaceId: string }>;
}

// ─── Streaming components ────────────────────────────────────────────────────

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

// ─── Page ────────────────────────────────────────────────────────────────────

/**
 * Team Page — skeleton shows instantly via loading.tsx.
 * Data fetches are inside Suspense so they don't block rendering.
 */
export default async function TeamPage({ params }: TeamPageProps) {
    const { workspaceId } = await params;

    return (
        <div className="flex flex-col gap-4 sm:gap-5">
            {/* Static heading — renders immediately, no fetch needed */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <h1 className="text-2xl font-bold leading-tight tracking-tighter md:text-3xl">
                    Team Members
                </h1>
            </div>

            {/* Members table streams in */}
            <Suspense fallback={<TeamPageSkeleton />}>
                <TeamMembersList workspaceId={workspaceId} />
            </Suspense>
        </div>
    );
}
