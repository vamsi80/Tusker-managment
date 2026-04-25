import { ReactNode } from "react";
import Link from "next/link";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
        <div className="flex flex-col gap-4 sm:gap-5 w-full">
            <TeamSectionHeader workspaceId={workspaceId} />
            <TeamNav workspaceId={workspaceId} isAdmin={permissions.isWorkspaceAdmin} />
            <div className="mt-2">
                {children}
            </div>
        </div>
    );
}
