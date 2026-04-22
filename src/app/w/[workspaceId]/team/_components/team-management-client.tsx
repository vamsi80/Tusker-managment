"use client";

import { useState, useEffect } from "react";
import { workspacesClient } from "@/lib/api-client/workspaces";
import { AppLoader } from "@/components/shared/app-loader";
import { TeamMembers } from "./team-members-table";
import { useWorkspaceLayout } from "../../_components/workspace-layout-context";

interface TeamManagementClientProps {
    workspaceId: string;
}

/**
 * Client-side bootstrap for the Team Management page.
 * Fetches members and permissions via Hono (Zero-RSC).
 */
export function TeamManagementClient({ workspaceId }: TeamManagementClientProps) {
    const { data: layoutData, isLoading: layoutLoading, revalidate } = useWorkspaceLayout();
    const [isLoadingMembers, setIsLoadingMembers] = useState(true);
    const [members, setMembers] = useState<any[]>([]);

    useEffect(() => {
        async function fetchData() {
            try {
                setIsLoadingMembers(true);
                // We still fetch members because they are not in the layout context
                const membersRes = await workspacesClient.getMembers(workspaceId);
                setMembers(membersRes.data?.workspaceMembers || []);
                
                // Background revalidation is now handled by the LayoutProvider's throttle policy
                // No need to manually trigger it here on every navigation
            } catch (error) {
                console.error("Failed to fetch team data:", error);
            } finally {
                setIsLoadingMembers(false);
            }
        }

        fetchData();
    }, [workspaceId]);

    if (isLoadingMembers) {
        return <AppLoader />;
    }

    return (
        <TeamMembers
            data={members}
            isAdmin={layoutData?.permissions?.isWorkspaceAdmin || false}
            workspaceId={workspaceId}
        />
    );
}
