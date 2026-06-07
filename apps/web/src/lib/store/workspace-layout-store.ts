import { create } from 'zustand';
import { WorkspaceLayoutData } from '@/types/workspace';
import { workspacesClient } from '@/lib/api-client/workspaces';
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

// Tracks in-flight unread count fetches to prevent duplicate requests when
// fetchLayout is called concurrently (e.g. React Strict Mode double-invoke).
const pendingUnreadFetches = new Set<string>();

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

                // Fetch unread count separately — non-blocking, fires after layout is stored.
                // Guard prevents duplicate requests when fetchLayout is called more than once.
                if (!pendingUnreadFetches.has(workspaceId)) {
                    pendingUnreadFetches.add(workspaceId);
                    workspacesClient.getUnreadCount(workspaceId)
                        .then((count) => {
                            set((state) => {
                                const current = state.layoutData[workspaceId];
                                if (!current) return state;
                                return {
                                    layoutData: {
                                        ...state.layoutData,
                                        [workspaceId]: { ...current, unreadNotificationsCount: count }
                                    }
                                };
                            });
                        })
                        .catch(() => { /* badge stays 0, non-critical */ })
                        .finally(() => pendingUnreadFetches.delete(workspaceId));
                }
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
