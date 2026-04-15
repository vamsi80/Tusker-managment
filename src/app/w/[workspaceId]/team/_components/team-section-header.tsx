"use client";

import { useEffect } from "react";
import { AdminActionsClient } from "./admin-actions-client";
import { useWorkspaceLayout } from "../../_components/workspace-layout-context";

interface TeamSectionHeaderProps {
    workspaceId: string;
}

/**
 * TeamSectionHeader
 * Client component that displays the "Team" title and AdminActions (Invite button).
 * Fetches workspace layout data to determine admin permissions via Hono.
 */
export function TeamSectionHeader({ workspaceId }: TeamSectionHeaderProps) {
    const { data: layoutData, revalidate } = useWorkspaceLayout();
    const isAdmin = layoutData?.permissions?.isWorkspaceAdmin || false;

    useEffect(() => {
        // Trigger background revalidation on mount
        revalidate();
    }, [revalidate]);

    return (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <h1 className="text-2xl font-bold leading-tight tracking-tighter md:text-3xl">
                Team
            </h1>
            
            <AdminActionsClient workspaceId={workspaceId} isAdmin={isAdmin} />
        </div>
    );
}
