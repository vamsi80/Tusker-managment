"use client";

import { useState, useEffect, useCallback } from "react";
import { workspacesClient } from "@/lib/api-client/workspaces";
import { AppLoader } from "@/components/shared/app-loader";
import { TeamMembers } from "./team-members-table";
import { useWorkspaceLayout } from "../../_components/workspace-layout-context";
import { pusherClient } from "@/lib/pusher";
import { TEAM_UPDATE } from "@/lib/realtime";
import { WorkspaceMembersResult } from "@/types/workspace";
import { useRealtimeMemberSync } from "@/lib/store/workspace-member-store";

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
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(10);
    const [totalCount, setTotalCount] = useState(0);

    const fetchData = useCallback(async (targetPage: number, targetLimit: number) => {
        try {
            if (members.length === 0) setIsLoadingMembers(true);
            setIsRefreshing(true);
            const membersRes: WorkspaceMembersResult = await workspacesClient.getMembers(workspaceId, targetPage, targetLimit);
            setMembers(membersRes.workspaceMembers || []);
            setTotalCount(membersRes.totalCount || 0);
        } catch (error) {
            console.error("Failed to fetch team data:", error);
        } finally {
            setIsLoadingMembers(false);
            setIsRefreshing(false);
        }
    }, [workspaceId, members.length]);

    // Fetch data when page or limit changes
    useEffect(() => {
        fetchData(page, limit);
    }, [fetchData, page, limit]);

    // Use unified real-time sync hook to refresh both global store and local table
    useRealtimeMemberSync(workspaceId, () => fetchData(page, limit));

    if (isLoadingMembers) {
        return <AppLoader />;
    }

    return (
        <TeamMembers
            data={members}
            isAdmin={layoutData?.permissions?.isWorkspaceAdmin || false}
            workspaceId={workspaceId}
            onRefresh={() => fetchData(page, limit)}
            isRefreshing={isRefreshing}
            pagination={{
                page,
                limit,
                totalCount,
                onPageChange: (newPage) => setPage(newPage),
                onLimitChange: (newLimit) => {
                    setLimit(newLimit);
                    setPage(1); // Reset to first page when limit changes
                }
            }}
        />
    );
}
