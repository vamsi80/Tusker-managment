import { create } from 'zustand';
import { WorkspaceMemberRow, SlimMember } from '@/types/workspace';
import { apiClient } from '@/lib/api-client';
import { useEffect } from 'react';
import { pusherClient } from '@/lib/pusher';
import { TEAM_UPDATE } from '@/lib/realtime';

interface WorkspaceMemberState {
    membersByWorkspace: Record<string, WorkspaceMemberRow[]>;
    slimMembersByWorkspace: Record<string, SlimMember[]>;
    isLoading: Record<string, boolean>;
    fetchMembers: (workspaceId: string, force?: boolean) => Promise<void>;
    fetchSlimMembers: (workspaceId: string) => Promise<void>;
    refreshMembers: (workspaceId: string) => Promise<void>;
    clearMembers: (workspaceId: string) => void;
    setMembers: (workspaceId: string, members: WorkspaceMemberRow[]) => void;
}

export const EMPTY_ARRAY: any[] = [];

/**
 * Global store for workspace members to prevent redundant API calls across different pages/components.
 * Especially useful for components like AttendanceTable that need the full member list for filters.
 */
export const useWorkspaceMemberStore = create<WorkspaceMemberState>((set, get) => ({
    membersByWorkspace: {},
    slimMembersByWorkspace: {},
    isLoading: {},

    fetchSlimMembers: async (workspaceId: string) => {
        if (!workspaceId) return;
        const { slimMembersByWorkspace } = get();
        
        // Don't refetch if we already have them
        if (slimMembersByWorkspace[workspaceId]) return;

        try {
            const members = await apiClient.workspaces.getMembersSlim(workspaceId);
            set((state) => ({
                slimMembersByWorkspace: {
                    ...state.slimMembersByWorkspace,
                    [workspaceId]: members
                }
            }));
        } catch (error) {
            console.error("Failed to fetch slim members:", error);
        }
    },

    fetchMembers: async (workspaceId: string, force = false) => {
        if (!workspaceId) {
            console.warn("[WorkspaceMemberStore] fetchMembers called without workspaceId");
            return;
        }

        const { membersByWorkspace, isLoading } = get();
        console.log(`[WorkspaceMemberStore] fetchMembers: ${workspaceId} (force=${force})`);

        // Return if already loading or if data exists (even if empty array) and not forced
        if (isLoading[workspaceId] || (!force && membersByWorkspace[workspaceId] !== undefined)) {
            return;
        }

        set((state) => ({
            isLoading: { ...state.isLoading, [workspaceId]: true }
        }));

        try {
            // Fetch members with pagination (10 per page as requested)
            const res = await apiClient.workspaces.getMembers(workspaceId, 1, 10);
            if (res && res.workspaceMembers) {
                set((state) => ({
                    membersByWorkspace: {
                        ...state.membersByWorkspace,
                        [workspaceId]: res.workspaceMembers
                    },
                    isLoading: { ...state.isLoading, [workspaceId]: false }
                }));
            }
        } catch (error) {
            console.error(`Failed to fetch members for workspace ${workspaceId}:`, error);
            set((state) => ({
                isLoading: { ...state.isLoading, [workspaceId]: false }
            }));
        }
    },

    clearMembers: (workspaceId: string) => {
        set((state) => {
            const newMembers = { ...state.membersByWorkspace };
            delete newMembers[workspaceId];
            return { membersByWorkspace: newMembers };
        });
    },

    refreshMembers: async (workspaceId: string) => {
        const { fetchMembers } = get();
        await fetchMembers(workspaceId, true);
    },

    setMembers: (workspaceId: string, members: WorkspaceMemberRow[]) => {
        set((state) => ({
            membersByWorkspace: {
                ...state.membersByWorkspace,
                [workspaceId]: members
            }
        }));
    }
}));

/**
 * Hook to automatically sync the member store with real-time updates.
 * Add this to any layout or main component that uses the member store.
 * @param onUpdate Optional callback to run when an update is received (e.g. to refresh local state)
 */
export function useRealtimeMemberSync(workspaceId: string, onUpdate?: () => void) {
    const { refreshMembers } = useWorkspaceMemberStore();

    useEffect(() => {
        console.log(`[RealtimeMemberSync] Subscribing to team-${workspaceId}`);
        const channel = pusherClient?.subscribe(`team-${workspaceId}`);
        channel?.bind(TEAM_UPDATE, () => {
            console.log(`[RealtimeMemberSync] TEAM_UPDATE received for ${workspaceId}`);
            useWorkspaceMemberStore.getState().refreshMembers(workspaceId);
            if (onUpdate) onUpdate();
        });

        return () => {
            console.log(`[RealtimeMemberSync] Unsubscribing from team-${workspaceId}`);
            pusherClient?.unsubscribe(`team-${workspaceId}`);
        };
    }, [workspaceId, onUpdate]);
}
