import { TeamManagementClient } from "./_components/team-management-client";
export const dynamic = "force-dynamic";

interface TeamPageProps {
    params: Promise<{ workspaceId: string }>;
}

export default async function TeamPage({ params }: TeamPageProps) {
    const { workspaceId } = await params;

    return (
        <div className="w-full">
            <TeamManagementClient workspaceId={workspaceId} />
        </div>
    );
}
