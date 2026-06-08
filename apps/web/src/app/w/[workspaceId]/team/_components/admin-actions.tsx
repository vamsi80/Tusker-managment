import { serverApiFetch } from "@/lib/api-client/server-fetch";
import { InviteUserForm } from "./create-user";

interface AdminActionsProps {
    workspaceId: string;
}

export async function AdminActions({ workspaceId }: AdminActionsProps) {
    const { data: permissions } = await serverApiFetch<{ success: boolean; data: { isWorkspaceAdmin: boolean } }>(
        `/workspaces/${workspaceId}/permissions`
    ).catch(() => ({ data: { isWorkspaceAdmin: false } }));

    if (!permissions.isWorkspaceAdmin) {
        return null;
    }

    return (
        <div className="flex items-center gap-2 w-full sm:w-auto">
            <InviteUserForm workspaceId={workspaceId} isAdmin={true} />
        </div>
    );
}
