"use client";

import { useState, useEffect, useCallback } from "react";
import { workspacesClient } from "@/lib/api-client/workspaces";
import { AppLoader } from "@/components/shared/app-loader";
import { TeamMembers } from "./team-members-table";
import { useWorkspaceLayout } from "../../_components/workspace-layout-context";
import { pusherClient } from "@/lib/pusher";
import { TEAM_UPDATE } from "@/lib/realtime";

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

    const fetchData = useCallback(async () => {
        try {
            setIsLoadingMembers(true);
            const membersRes = await workspacesClient.getMembers(workspaceId);
            setMembers(membersRes.data?.workspaceMembers || []);
        } catch (error) {
            console.error("Failed to fetch team data:", error);
        } finally {
            setIsLoadingMembers(false);
        }
    }, [workspaceId]);

    useEffect(() => {
        fetchData();

        // Listen for real-time team updates
        const channel = pusherClient?.subscribe(`workspace-${workspaceId}`);
        channel?.bind(TEAM_UPDATE, () => {
            fetchData();
        });

        return () => {
            pusherClient?.unsubscribe(`workspace-${workspaceId}`);
        };
    }, [workspaceId, fetchData]);

    if (isLoadingMembers) {
        return <AppLoader />;
    }

    return (
        <TeamMembers
            data={members}
            isAdmin={layoutData?.permissions?.isWorkspaceAdmin || false}
            workspaceId={workspaceId}
            onRefresh={fetchData}
        />
    );
}
