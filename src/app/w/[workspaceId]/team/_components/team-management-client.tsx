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

    // Helper to flatten Prisma records into the shape the UI expects
    const flattenRecord = (r: any) => {
        if (!r) return r;
        // Ensure user object exists or is flattened correctly
        return r;
    };

    useEffect(() => {
        const handler = (e: any) => {
            const { action, record, oldRecord } = e.detail || {};
            const flatRecord = flattenRecord(record);
            
            console.log(`[TeamManagementClient][SURGICAL_V2] 🔄 Event received: ${action}`, { 
                record: flatRecord, 
                original: record 
            });

            // 1. Handle New Members
            if (flatRecord && action === "MEMBER_INVITED") {
                setMembers(prev => {
                    if (prev.some(m => m.id === flatRecord.id)) return prev;
                    return [flatRecord, ...prev];
                });
                setTotalCount(prev => prev + 1);
                return;
            }

            // 2. Handle Updates
            if (flatRecord && action === "MEMBER_UPDATED") {
                setMembers(prev => prev.map(m => m.id === flatRecord.id ? flatRecord : m));
                return;
            }

            // 3. Handle Deletions
            if (action === "MEMBER_REMOVED") {
                const memberId = record?.id || oldRecord?.id;
                if (memberId) {
                    setMembers(prev => prev.filter(m => m.id !== memberId));
                    setTotalCount(prev => Math.max(0, prev - 1));
                    return;
                }
            }

            // ⛔ BLOCK Fallback for all known member actions to prevent the fetch
            if (action?.startsWith("MEMBER_")) {
                console.log(`[TeamManagementClient] ✅ Surgical update complete for ${action}. No fetch required.`);
                return;
            }

            // Fallback for unknown structural changes
            if (action === "team_update" || !action) {
                console.log(`[TeamManagementClient] ⚠️ Unknown action, falling back to fetch...`);
                fetchData(page, limit, true, true); 
            }
        };
        window.addEventListener("realtime-sync-refresh", handler);
        return () => window.removeEventListener("realtime-sync-refresh", handler);
    }, [workspaceId, page, limit]);

    const fetchData = useCallback(async (targetPage: number, targetLimit: number, force = false, silent = false) => {
        try {
            if (!silent) {
                if (members.length === 0) setIsLoadingMembers(true);
                setIsRefreshing(true);
            }
            const membersRes: WorkspaceMembersResult = await workspacesClient.getMembers(workspaceId, targetPage, targetLimit);
            setMembers(membersRes.workspaceMembers || []);
            setTotalCount(membersRes.totalCount || 0);
        } catch (error) {
            console.error("Failed to fetch team data:", error);
        } finally {
            setIsLoadingMembers(false);
            setIsRefreshing(false);
        }
    }, [workspaceId]);

    // Fetch data when page or limit changes
    useEffect(() => {
        fetchData(page, limit);
    }, [fetchData, page, limit]);

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
