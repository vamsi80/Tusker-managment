import { ReactNode } from "react";
import { TeamNav } from "./_components/team-nav";
import { serverApiFetch } from "@/lib/api-client/server-fetch";

interface TeamLayoutProps {
    children: ReactNode;
    params: Promise<{ workspaceId: string }>;
}

export default async function TeamLayout({ children, params }: TeamLayoutProps) {
    const { workspaceId } = await params;

    const { data: permissions } = await serverApiFetch<{ success: boolean; data: { isWorkspaceAdmin: boolean } }>(
        `/workspaces/${workspaceId}/permissions`
    ).catch(() => ({ data: { isWorkspaceAdmin: false } }));

    return (
        <div className="flex flex-col w-full">
            <TeamNav workspaceId={workspaceId} isAdmin={permissions.isWorkspaceAdmin} />
            <div className="mt-4">
                {children}
            </div>
        </div>
    );
}
