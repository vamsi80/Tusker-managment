import { Suspense } from "react";
import { TeamMembers } from "./_components/team-members-table";
import { AppLoader } from "@/components/shared/app-loader";
import { getWorkspaceMembers } from "@/data/workspace";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";
import { InviteUserForm } from "./_components/create-user";

export const dynamic = "force-dynamic";

interface TeamPageProps {
    params: Promise<{ workspaceId: string }>;
}

// ─── Streaming components ────────────────────────────────────────────────────

async function TeamMembersList({ workspaceId, isAdmin }: { workspaceId: string; isAdmin: boolean }) {
    const data = await getWorkspaceMembers(workspaceId);

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
 * Team Page — AppLoader shows while streaming members.
 */
export default async function TeamPage({ params }: TeamPageProps) {
    const { workspaceId } = await params;
    const permissions = await getWorkspacePermissions(workspaceId);
    const isAdmin = permissions.isWorkspaceAdmin;

    return (
        <div className="flex flex-col gap-4 sm:gap-5">
            {/* Static heading — renders immediately, no fetch needed */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <h1 className="text-2xl font-bold leading-tight tracking-tighter md:text-3xl">
                    Team Members
                </h1>
                {isAdmin && (
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        <InviteUserForm workspaceId={workspaceId} isAdmin={isAdmin} />
                    </div>
                )}
            </div>

            {/* Members table streams in */}
            <Suspense fallback={<AppLoader />}>
                <TeamMembersList workspaceId={workspaceId} isAdmin={isAdmin} />
            </Suspense>
        </div>
    );
}
