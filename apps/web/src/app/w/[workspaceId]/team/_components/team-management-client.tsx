"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { workspacesClient } from "@/lib/api-client/workspaces";
import { AppLoader } from "@/components/shared/app-loader";
import { TeamMembers } from "./team-members-table";
import { useTeamQueryStore } from "@/lib/store/team-query-store";
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
    const [members, setMembers] = useState<any[]>([]);
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(10);
    const [totalCount, setTotalCount] = useState(0);
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(search);
        }, 500);
        return () => clearTimeout(timer);
    }, [search]);

    // Helper to flatten Prisma records into the shape the UI expects
    const flattenRecord = (r: any) => {
        if (!r) return r;
        // Ensure user object exists or is flattened correctly
        return r;
    };

    const { setIsQuerying } = useTeamQueryStore();
    // Track whether the initial load has completed so we don't show the full
    // spinner on subsequent page/search changes. Using a ref avoids putting
    // members.length in fetchData's dep array, which would cause an infinite
    // re-fetch loop (fetch completes → length changes → new fetchData ref →
    // effect re-fires → fetch again).
    const hasLoadedOnce = useRef(false);

    const fetchData = useCallback(async (targetPage: number, targetLimit: number, targetSearch: string = debouncedSearch, force = false, silent = false) => {
        try {
            setIsQuerying(true);
            if (!silent && !hasLoadedOnce.current) setIsLoadingMembers(true);
            const membersRes: WorkspaceMembersResult = await workspacesClient.getMembers(workspaceId, targetPage, targetLimit, targetSearch);
            hasLoadedOnce.current = true;
            setMembers(membersRes.workspaceMembers || []);
            setTotalCount(membersRes.totalCount || 0);
        } catch (error) {
            console.error("Failed to fetch team data:", error);
        } finally {
            setIsLoadingMembers(false);
            setIsQuerying(false);
        }
    }, [workspaceId, debouncedSearch, setIsQuerying]);

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
                fetchData(page, limit, debouncedSearch, true, true); 
            }
        };
        window.addEventListener("realtime-sync-refresh", handler);
        return () => window.removeEventListener("realtime-sync-refresh", handler);
    }, [workspaceId, page, limit, debouncedSearch, fetchData]);

    // Fetch data when page, limit, or debouncedSearch changes
    useEffect(() => {
        fetchData(page, limit, debouncedSearch);
    }, [fetchData, page, limit, debouncedSearch]);

    if (isLoadingMembers) {
        return <AppLoader />;
    }

    return (
        <TeamMembers
            data={members}
            isAdmin={layoutData?.permissions?.isWorkspaceAdmin || false}
            workspaceId={workspaceId}
            pagination={{
                page,
                limit,
                totalCount,
                search,
                onSearchChange: (newSearch) => {
                    setSearch(newSearch);
                    setPage(1); // Reset to first page when search changes
                },
                onPageChange: (newPage) => setPage(newPage),
                onLimitChange: (newLimit) => {
                    setLimit(newLimit);
                    setPage(1); // Reset to first page when limit changes
                }
            }}
        />
    );
}
