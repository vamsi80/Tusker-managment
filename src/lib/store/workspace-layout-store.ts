import { create } from 'zustand';
import { WorkspaceLayoutData } from '@/types/workspace';
import { workspacesClient } from '@/lib/api-client/workspaces';
import { pusherClient } from '@/lib/pusher';
import { TEAM_UPDATE, PROJECT_UPDATE } from '@/lib/realtime';

interface WorkspaceLayoutState {
    layoutData: Record<string, WorkspaceLayoutData>;
    isLoading: Record<string, boolean>;
    isRevalidating: Record<string, boolean>;
    
    // Actions
    fetchLayout: (workspaceId: string, isSilent?: boolean) => Promise<void>;
    revalidate: (workspaceId: string, force?: boolean) => Promise<void>;
    setLayoutData: (workspaceId: string, data: WorkspaceLayoutData) => void;
    
    // Optimistic Actions
    optimisticRemoveProject: (workspaceId: string, projectId: string) => void;
    optimisticAddProject: (workspaceId: string, project: any) => void;
}

/**
 * Global store for workspace layout data (sidebar, projects, permissions).
 * Replaces redundant server-side revalidations with efficient client-side state management.
 */
export const useWorkspaceLayoutStore = create<WorkspaceLayoutState>((set, get) => ({
    layoutData: {},
    isLoading: {},
    isRevalidating: {},

    fetchLayout: async (workspaceId: string, isSilent = false) => {
        const { isLoading, isRevalidating } = get();
        
        // Prevent multiple simultaneous fetches
        if (isLoading[workspaceId] || isRevalidating[workspaceId]) return;

        if (!isSilent) {
            set((state) => ({ isLoading: { ...state.isLoading, [workspaceId]: true } }));
        } else {
            set((state) => ({ isRevalidating: { ...state.isRevalidating, [workspaceId]: true } }));
        }

        try {
            // Add a timeout safety to prevent getting stuck in isLoading: true
            const fetchPromise = workspacesClient.getLayoutData(workspaceId);
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error("Timeout")), 10000)
            );

            const data = await Promise.race([fetchPromise, timeoutPromise]) as WorkspaceLayoutData;
            
            if (data) {
                set((state) => ({
                    layoutData: { ...state.layoutData, [workspaceId]: data },
                    isLoading: { ...state.isLoading, [workspaceId]: false },
                    isRevalidating: { ...state.isRevalidating, [workspaceId]: false }
                }));
            }
        } catch (error) {
            console.error(`[WorkspaceLayoutStore] Fetch failed:`, error);
            set((state) => ({
                isLoading: { ...state.isLoading, [workspaceId]: false },
                isRevalidating: { ...state.isRevalidating, [workspaceId]: false }
            }));
        }
    },

    revalidate: async (workspaceId: string, force = false) => {
        const { fetchLayout } = get();
        await fetchLayout(workspaceId, true);
    },

    setLayoutData: (workspaceId: string, data: WorkspaceLayoutData) => {
        set((state) => ({
            layoutData: { ...state.layoutData, [workspaceId]: data }
        }));
    },

    optimisticRemoveProject: (workspaceId: string, projectId: string) => {
        set((state) => {
            const currentData = state.layoutData[workspaceId];
            if (!currentData) return state;

            return {
                layoutData: {
                    ...state.layoutData,
                    [workspaceId]: {
                        ...currentData,
                        projects: currentData.projects.filter(p => p.id !== projectId)
                    }
                }
            };
        });
    },

    optimisticAddProject: (workspaceId: string, project: any) => {
        set((state) => {
            const currentData = state.layoutData[workspaceId];
            if (!currentData) return state;

            // Avoid duplicates
            if (currentData.projects.some(p => p.id === project.id)) return state;

            return {
                layoutData: {
                    ...state.layoutData,
                    [workspaceId]: {
                        ...currentData,
                        projects: [...currentData.projects, project]
                    }
                }
            };
        });
    }
}));

import { useEffect } from 'react';

/**
 * Hook to automatically sync the layout store with real-time updates.
 */
export function useRealtimeLayoutSync(workspaceId: string) {
    const { revalidate, optimisticRemoveProject, optimisticAddProject } = useWorkspaceLayoutStore();

    useEffect(() => {
        if (!workspaceId || !pusherClient) return;

        const channelName = `workspace-${workspaceId}`;
        const channel = pusherClient.subscribe(channelName);

        // Team updates (roles, permissions)
        channel.bind(TEAM_UPDATE, () => {
            useWorkspaceLayoutStore.getState().revalidate(workspaceId, true);
        });

        // Project updates
        channel.bind(PROJECT_UPDATE, (eventData: any) => {
            const store = useWorkspaceLayoutStore.getState();
            if (eventData.type === "DELETE" && eventData.projectId) {
                store.optimisticRemoveProject(workspaceId, eventData.projectId);
            }
            
            if (eventData.type === "CREATE" && eventData.payload) {
                store.optimisticAddProject(workspaceId, eventData.payload);
            }

            // Force a clean revalidation after optimistic update
            setTimeout(() => {
                store.revalidate(workspaceId, true);
            }, 1000);
        });

        return () => {
            pusherClient?.unsubscribe(channelName);
        };
    }, [workspaceId]);
}
