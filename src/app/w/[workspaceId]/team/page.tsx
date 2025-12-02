import { Suspense } from "react";
import { InviteUserForm } from "./_components/create-user";
import { isAdminServer } from "@/lib/isAdminServer";
import { getWorkspaceMembers } from "@/app/data/workspace/get-workspace-members";
import { TeamMembers } from "./_components/team-members";
import { TeamMembersSkeleton } from "./_components/team-members-skeleton";

interface TeamPageProps {
    params: Promise<{
        workspaceId: string;
    }>;
}

export default async function TeamPage({ params }: TeamPageProps) {
    const { workspaceId } = await params;
    const isAdmin = await isAdminServer(workspaceId);

    return (
        <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-semibold leading-tight tracking-tighter md:text-4xl">
                    Team Members
                </h1>
                <InviteUserForm workspaceId={workspaceId} isAdmin={isAdmin} />
            </div>

            <Suspense fallback={<TeamMembersSkeleton />}>
                <TeamMembersList workspaceId={workspaceId} />
            </Suspense>
        </div>
    );
}

// Separate component for data fetching
async function TeamMembersList({ workspaceId }: { workspaceId: string }) {
    const data = await getWorkspaceMembers(workspaceId);
    return <TeamMembers data={data.workspaceMembers} />;
}
