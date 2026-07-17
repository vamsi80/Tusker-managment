"use client";

import { createContext, useContext, ReactNode, useEffect, useCallback, useTransition } from "react";
import { WorkspaceLayoutData } from "@/types/workspace";
import { useWorkspaceLayoutStore, useRealtimeLayoutSync } from "@/lib/store/workspace-layout-store";

interface WorkspaceLayoutContextType {
  data: WorkspaceLayoutData;
  workspaceId: string;
  isLoading: boolean;
  isRevalidating: boolean;
  isNavigating: boolean;
  startNavigation: (callback: () => void) => void;
  revalidate: (force?: boolean) => Promise<void>;
}

const WorkspaceLayoutContext = createContext<WorkspaceLayoutContextType | null>(null);

export function WorkspaceLayoutProvider({
  children,
  initialData,
  workspaceId,
}: {
  children: ReactNode;
  initialData?: WorkspaceLayoutData;
  workspaceId: string;
}) {
  const { layoutData, isLoading: storeLoading, isRevalidating: storeRevalidating, fetchLayout, revalidate: storeRevalidate, setLayoutData } = useWorkspaceLayoutStore();
  const [isNavigating, startTransition] = useTransition();

  const data = layoutData[workspaceId];

  // SIMPLIFIED: Only show loading if the store explicitly says it is loading
  // This prevents getting trapped in a skeleton state if data is missing.
  const isLoading = storeLoading[workspaceId] === true && !data;
  const isRevalidating = storeRevalidating[workspaceId] ?? false;

  // Subscribe to real-time updates via the unified hook
  useRealtimeLayoutSync(workspaceId);

  useEffect(() => {
    const store = useWorkspaceLayoutStore.getState();

    // If we have initialData and no data in store yet, hydrate the store
    if (initialData && !data) {
      store.setLayoutData(workspaceId, initialData);
      return;
    }

    // Fetch if we don't have data
    if (!data) {
      store.fetchLayout(workspaceId);
    }
  }, [workspaceId, data, initialData]);

  const revalidate = useCallback(async (force = false) => {
    await storeRevalidate(workspaceId, force);
  }, [workspaceId, storeRevalidate]);

  const startNavigation = useCallback((callback: () => void) => {
    startTransition(() => {
      callback();
    });
  }, []);

  // Provide a safe default for when data is loading
  const contextValue: WorkspaceLayoutContextType = {
    data: data || {
      workspaces: { workspaces: [], totalCount: 0 },
      projects: [],
      tags: [],
      projectManagers: {},
      unreadNotificationsCount: 0,
      permissions: {
        isWorkspaceAdmin: false,
        canCreateProject: false,
        workspaceMemberId: null,
        workspaceRole: null,
        userId: null,
        reportingManagerName: null,
        leadProjectIds: [],
        managedProjectIds: [],
        coordinatorProjectIds: [],
        memberProjectIds: [],
        viewerProjectIds: [],
      },
    } as WorkspaceLayoutData,
    workspaceId,
    isLoading,
    isRevalidating,
    isNavigating,
    startNavigation,
    revalidate
  };

  return (
    <WorkspaceLayoutContext.Provider value={contextValue}>
      {children}
    </WorkspaceLayoutContext.Provider>
  );
}

export function useWorkspaceLayout() {
  const context = useContext(WorkspaceLayoutContext);
  if (!context) {
    throw new Error("useWorkspaceLayout must be used within a WorkspaceLayoutProvider");
  }
  return context;
}
