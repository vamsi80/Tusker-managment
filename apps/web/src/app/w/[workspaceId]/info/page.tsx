import { serverApiFetch } from "@/lib/api-client/server-fetch";
import { WorkspaceInfoView } from "./_components/workspace-info-view";

export const revalidate = 300;

interface InfoPageProps {
    params: Promise<{ workspaceId: string }>;
}

export default async function InfoPage({ params }: InfoPageProps) {
    const { workspaceId } = await params;

    const { data: permissions } = await serverApiFetch<{ success: boolean; data: { isWorkspaceAdmin: boolean } }>(
        `/workspaces/${workspaceId}/permissions`
    ).catch(() => ({ data: { isWorkspaceAdmin: false } }));

    return (
        <div className="w-full py-0">
            <WorkspaceInfoView
                workspaceId={workspaceId}
                canEdit={permissions.isWorkspaceAdmin}
            />
        </div>
    );
}
