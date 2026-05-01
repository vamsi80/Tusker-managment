import { create } from 'zustand';
import { WorkspaceMemberRow } from '@/types/workspace';
import { apiClient } from '@/lib/api-client';
import { useEffect } from 'react';
import { pusherClient } from '@/lib/pusher';
import { TEAM_UPDATE } from '@/lib/realtime';

interface WorkspaceMemberState {
    membersByWorkspace: Record<string, WorkspaceMemberRow[]>;
    isLoading: Record<string, boolean>;
    fetchMembers: (workspaceId: string, force?: boolean) => Promise<void>;
    refreshMembers: (workspaceId: string) => Promise<void>;
    clearMembers: (workspaceId: string) => void;
    setMembers: (workspaceId: string, members: WorkspaceMemberRow[]) => void;
}

export const EMPTY_ARRAY: WorkspaceMemberRow[] = [];

/**
 * Global store for workspace members to prevent redundant API calls across different pages/components.
 * Especially useful for components like AttendanceTable that need the full member list for filters.
 */
export const useWorkspaceMemberStore = create<WorkspaceMemberState>((set, get) => ({
    membersByWorkspace: {},
    isLoading: {},

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
            // Fetch all members for filters (high limit to avoid pagination issues in store)
            const res = await apiClient.workspaces.getMembers(workspaceId, 1, 1000);
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
        console.log(`[RealtimeMemberSync] Subscribing to workspace-${workspaceId}`);
        const channel = pusherClient?.subscribe(`workspace-${workspaceId}`);
        channel?.bind(TEAM_UPDATE, () => {
            console.log(`[RealtimeMemberSync] TEAM_UPDATE received for ${workspaceId}`);
            useWorkspaceMemberStore.getState().refreshMembers(workspaceId);
            if (onUpdate) onUpdate();
        });

        return () => {
            console.log(`[RealtimeMemberSync] Unsubscribing from workspace-${workspaceId}`);
            pusherClient?.unsubscribe(`workspace-${workspaceId}`);
        };
    }, [workspaceId]);
}
