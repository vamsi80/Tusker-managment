import { ReactNode } from "react";
import { TeamSectionHeader } from "./_components/team-section-header";

import { TeamNav } from "./_components/team-nav";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";

interface TeamLayoutProps {
    children: ReactNode;
    params: Promise<{ workspaceId: string }>;
}

export default async function TeamLayout({ children, params }: TeamLayoutProps) {
    const { workspaceId } = await params;
    const permissions = await getWorkspacePermissions(workspaceId);

    return (
        <div className="flex flex-col w-full">
            <TeamSectionHeader workspaceId={workspaceId} />
            <TeamNav workspaceId={workspaceId} isAdmin={permissions.isWorkspaceAdmin} />
            <div className="mt-4">
                {children}
            </div>
        </div>
    );
}
