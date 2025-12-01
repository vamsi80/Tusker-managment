import { requireUser } from "@/app/data/user/require-user";
import { InviteUserForm } from "./_components/create-user";
import { requireAdmin } from "@/app/data/workspace/requireAdmin";
import { isAdminServer } from "@/lib/isAdminServer";
import { is } from "zod/v4/locales";

interface TeamPageProps {
    params: Promise<{
        workspaceId: string;
    }>;
}

export default async function TeamPage({ params }: TeamPageProps) {
    const { workspaceId } = await params;
    const user = await requireUser();
    const isAdmin = await isAdminServer(workspaceId);
    return (
        <div className="flex items-center justify-between">
            <h1 className="text-3xl font-semibold leading-tight tracking-tighter md:text-4xl">
                Welcome {user.name}
            </h1>
            <InviteUserForm workspaceId={workspaceId} isAdmin={isAdmin} />
        </div>
    );
}

// export async function userInvitation(workspaceId: string) {
//     const isAdmin = await isAdminServer(workspaceId);

//     return (
//         <InviteUserForm workspaceId={workspaceId} isAdmin={isAdmin} />
//     )
// }
