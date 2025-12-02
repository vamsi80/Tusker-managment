import { InviteUserForm } from "./_components/create-user";
import { isAdminServer } from "@/lib/isAdminServer";

interface TeamPageProps {
    params: Promise<{
        workspaceId: string;
    }>;
}

import { getWorkspacesProjectsByWorkspaceId } from "@/app/data/workspace/get-workspace-members";
import { TeamMembers } from "./_components/team-members";

export default async function TeamPage({ params }: TeamPageProps) {
    const { workspaceId } = await params;
    const isAdmin = await isAdminServer(workspaceId);
    const data = await getWorkspacesProjectsByWorkspaceId(workspaceId);

    return (
        <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-semibold leading-tight tracking-tighter md:text-4xl">
                    Team Members
                </h1>
                <InviteUserForm workspaceId={workspaceId} isAdmin={isAdmin} />
            </div>
            <TeamMembers data={data.workspaceMembers} />
        </div>
    );
}

// export async function userInvitation(workspaceId: string) {
//     const isAdmin = await isAdminServer(workspaceId);

//     return (
//         <InviteUserForm workspaceId={workspaceId} isAdmin={isAdmin} />
//     )
// }
