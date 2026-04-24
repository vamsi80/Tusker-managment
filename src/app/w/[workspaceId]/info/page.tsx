import { getWorkspacePermissions } from "@/data/user/get-user-permissions";
import { WorkspaceInfoView } from "./_components/workspace-info-view";

export const dynamic = "force-dynamic";
export const revalidate = 300; // Revalidate every 5 minutes (semi-static)

interface InfoPageProps {
    params: Promise<{
        workspaceId: string;
    }>;
}

export default async function InfoPage({ params }: InfoPageProps) {
    const { workspaceId } = await params;
    const permissions = await getWorkspacePermissions(workspaceId);

    return (
        <div className="w-full py-0">
            <WorkspaceInfoView
                workspaceId={workspaceId}
                canEdit={permissions.isWorkspaceAdmin}
            />
        </div>
    );
}
