"use client";

import { useState, useEffect, useCallback } from "react";
import { workspacesClient } from "@/lib/api-client/workspaces";
import { AppLoader } from "@/components/shared/app-loader";
import { TeamMembers } from "./team-members-table";
import { useWorkspaceLayout } from "../../_components/workspace-layout-context";
import { pusherClient } from "@/lib/pusher";
import { TEAM_UPDATE } from "@/lib/realtime";
import { WorkspaceMembersResult } from "@/types/workspace";

interface TeamManagementClientProps {
    workspaceId: string;
}

/**
 * Client-side bootstrap for the Team Management page.
 * Fetches members and permissions via Hono (Zero-RSC).
 */
export function TeamManagementClient({ workspaceId }: TeamManagementClientProps) {
    const { data: layoutData } = useWorkspaceLayout();
    const [isLoadingMembers, setIsLoadingMembers] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [members, setMembers] = useState<any[]>([]);

    const fetchData = useCallback(async () => {
        try {
            if (members.length === 0) setIsLoadingMembers(true);
            setIsRefreshing(true);
            const membersRes: WorkspaceMembersResult = await workspacesClient.getMembers(workspaceId);
            setMembers(membersRes.workspaceMembers || []);
        } catch (error) {
            console.error("Failed to fetch team data:", error);
        } finally {
            setIsLoadingMembers(false);
            setIsRefreshing(false);
        }
    }, [workspaceId, members.length]);

    useEffect(() => {
        fetchData();

        // Listen for real-time team updates
        const channel = pusherClient?.subscribe(`team-${workspaceId}`);
        channel?.bind(TEAM_UPDATE, () => {
            fetchData();
        });

        return () => {
            pusherClient?.unsubscribe(`team-${workspaceId}`);
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
            isRefreshing={isRefreshing}
        />
    );
}
