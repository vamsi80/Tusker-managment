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

    useEffect(() => {
        if (!workspaceId) return;

        // Only subscribe to PROJECT and MEMBER events — task/attendance/board events
        // do not affect sidebar structure (projects list, permissions, workspace list)
        // and must not trigger a layout revalidation.

        const unsubscribeProject = pubsub.subscribe(EVENTS.PROJECT_UPDATE, (eventData: any) => {
            const store = useWorkspaceLayoutStore.getState();
            const type = (eventData.type || "").toUpperCase();
            const action = (eventData.action || "").toUpperCase();
            const projectId = eventData.projectId || eventData.payload?.id;

            if ((type === "DELETE" || action.includes("DELETED")) && projectId) {
                store.optimisticRemoveProject(workspaceId, projectId);
            } else if (type === "CREATE" && eventData.payload) {
                store.optimisticAddProject(workspaceId, eventData.payload);
            }

            // Only revalidate on structural changes; routine field edits are handled
            // surgically by realtime-project-sync CustomEvent listeners.
            const STRUCTURAL = ["CREATE", "DELETE", "ARCHIVE", "RESTORE"];
            if (STRUCTURAL.includes(type)) {
                store.revalidate(workspaceId, true);
            }
        });

        const unsubscribeMember = pubsub.subscribe(EVENTS.MEMBER_UPDATE, () => {
            // Member role/access changes affect workspace permissions in the layout
            useWorkspaceLayoutStore.getState().revalidate(workspaceId, true);
        });

        return () => {
            unsubscribeProject();
            unsubscribeMember();
        };
    }, [workspaceId]);
}
