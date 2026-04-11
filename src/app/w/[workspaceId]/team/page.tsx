import { Suspense } from "react";
import { TeamMembers } from "./_components/team-members-table";
import { AppLoader } from "@/components/shared/app-loader";
import { getWorkspaceMembers } from "@/data/workspace";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";
import { AdminActions } from "./_components/admin-actions";

export const dynamic = "force-dynamic";

interface TeamPageProps {
    params: Promise<{ workspaceId: string }>;
}

// ─── Streaming components ────────────────────────────────────────────────────

async function TeamMembersList({ workspaceId }: { workspaceId: string }) {
    // Parallelize permission check and members fetch to reduce waterfall
    const [permissions, data] = await Promise.all([
        getWorkspacePermissions(workspaceId),
        getWorkspaceMembers(workspaceId)
    ]);

    return (
        <TeamMembers
            data={data.workspaceMembers}
            isAdmin={permissions.isWorkspaceAdmin}
            workspaceId={workspaceId}
        />
    );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function TeamPage({ params }: TeamPageProps) {
    const { workspaceId } = await params;

    return (
        <div className="flex flex-col gap-4 sm:gap-5">
            {/* Static heading — renders immediately, no fetch needed */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <h1 className="text-2xl font-bold leading-tight tracking-tighter md:text-3xl">
                    Team Members
                </h1>
                
                {/* Admin actions (Invite button) stream in separately */}
                <Suspense fallback={<div className="h-10 w-32 bg-muted/20 animate-pulse rounded-md" />}>
                    <AdminActions workspaceId={workspaceId} />
                </Suspense>
            </div>

            {/* Members table streams in */}
            <Suspense fallback={<AppLoader />}>
                <TeamMembersList workspaceId={workspaceId} />
            </Suspense>
        </div>
    );
}
