import { serverApiFetch } from "@/lib/api-client/server-fetch";
import { WorkspaceTasksHeaderClient } from "./workspace-tasks-header-client";

interface WorkspaceTasksHeaderProps {
    workspaceId: string;
}

export async function WorkspaceTasksHeader({ workspaceId }: WorkspaceTasksHeaderProps) {
    const { data: permissions } = await serverApiFetch<{ success: boolean; data: { isWorkspaceAdmin: boolean; hasAccess: boolean } }>(
        `/workspaces/${workspaceId}/permissions`
    ).catch(() => ({ data: { isWorkspaceAdmin: false, hasAccess: false } }));

    return (
        <WorkspaceTasksHeaderClient
            workspaceId={workspaceId}
            permissions={{
                isWorkspaceAdmin: permissions.isWorkspaceAdmin,
                canCreateTasks: permissions.isWorkspaceAdmin,
                canCreateSubTasks: permissions.hasAccess,
            }}
        />
    );
}
