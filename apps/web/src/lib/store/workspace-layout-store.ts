import { create } from 'zustand';
import { WorkspaceLayoutData } from '@tusker/core/types/workspace';
import { workspacesClient } from '@tusker/api-client/workspaces';
import { pubsub, EVENTS } from '@/lib/pubsub';

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

/** How long /layout may take before the shell stops waiting on it. */
const SLOW_LAYOUT_MS = 10000;

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

        const clearFlags = () => set((state) => ({
            isLoading: { ...state.isLoading, [workspaceId]: false },
            isRevalidating: { ...state.isRevalidating, [workspaceId]: false }
        }));

        // A watchdog, not a deadline. It only releases the loading flag so the
        // shell can render; the request is left to finish. Racing it away threw
        // the response out, and since the provider refetches only when `data`
        // changes - and it stayed undefined - nothing retried: a slow /layout
        // left the workspace with no projects and no permissions (so no admin
        // UI, no workload column) until a manual reload.
        const watchdog = setTimeout(() => {
            console.warn(
                `[WorkspaceLayoutStore] /layout is slow (>${SLOW_LAYOUT_MS}ms); rendering the shell while it finishes.`
            );
            clearFlags();
        }, SLOW_LAYOUT_MS);

        try {
            const data = await workspacesClient.getLayoutData(workspaceId);

            if (data) {
                set((state) => ({
                    layoutData: { ...state.layoutData, [workspaceId]: data }
                }));
            }
        } catch (error) {
            console.error(`[WorkspaceLayoutStore] Fetch failed:`, error);
        } finally {
            clearTimeout(watchdog);
            clearFlags();
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

    useEffect(() => {
        if (!workspaceId) return;

        // Use the centralized pubsub service for all workspace events
        const unsubscribe = pubsub.subscribe(EVENTS.TEAM_UPDATE, (eventData: any) => {
            const store = useWorkspaceLayoutStore.getState();

            // Handle project-specific updates surgically
            if (eventData.projectId || eventData.payload?.id) {
                const projectId = eventData.projectId || eventData.payload?.id;

                if (eventData.type === "DELETE") {
                    store.optimisticRemoveProject(workspaceId, projectId);
                }

                if (eventData.type === "CREATE" && eventData.payload) {
                    store.optimisticAddProject(workspaceId, eventData.payload);
                }

                // Silent revalidation backup
                setTimeout(() => {
                    store.revalidate(workspaceId, true);
                }, 1000);
            } else {
                // General team/workspace update (roles, permissions)
                store.revalidate(workspaceId, true);
            }
        });

        return () => {
            unsubscribe();
        };
    }, [workspaceId]);
}
