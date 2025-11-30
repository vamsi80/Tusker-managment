import { requireUser } from "@/app/data/user/require-user";
import { InviteUserForm } from "./_components/create-user";

interface TeamPageProps {
    params: Promise<{
        workspaceId: string;
    }>;
}

export default async function TeamPage({ params }: TeamPageProps) {
    const { workspaceId } = await params;
    const user = await requireUser();

    console.log("Workspace ID:", workspaceId);

    return (
        <div className="flex items-center justify-between">
            <h1 className="text-3xl font-semibold leading-tight tracking-tighter md:text-4xl">
                Welcome {user.name}
            </h1>
            <InviteUserForm workspaceId={workspaceId} />
        </div>
    );
}
