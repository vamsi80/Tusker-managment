"use client";

import React, { createContext, useContext, ReactNode, useState, useEffect, useCallback, useTransition } from "react";
import type { getWorkspaceLayoutData } from "@/data/workspace/get-workspace-layout-data";
import { workspacesClient } from "@/lib/api-client/workspaces";

type LayoutData = Awaited<ReturnType<typeof getWorkspaceLayoutData>>;

interface WorkspaceLayoutContextType {
  data: LayoutData;
  tags: any[];
  workspaceId: string;
  isLoading: boolean;
  isNavigating: boolean;
  startNavigation: (callback: () => void) => void;
  revalidate: () => Promise<void>;
}

const WorkspaceLayoutContext = createContext<WorkspaceLayoutContextType | null>(null);

export function WorkspaceLayoutProvider({
  children,
  initialData,
  workspaceId,
}: {
  children: ReactNode;
  initialData?: LayoutData;
  workspaceId: string;
}) {
  const [data, setData] = useState<LayoutData | null>(initialData || null);
  const [tags, setTags] = useState<any[]>(initialData?.tags || []);
  const [isLoading, setIsLoading] = useState(!initialData);
  const [isNavigating, startTransition] = useTransition();
  const lastFetchTimeRef = React.useRef<number>(initialData ? Date.now() : 0);
  const THROTTLE_MS = 45000; // 45 seconds
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(workspaceId);

  const fetchLayout = useCallback(async (isSilent = false) => {
    // 🛡️ Throttle check: Skip if we fetched very recently (e.g. within 45s)
    if (isSilent && Date.now() - lastFetchTimeRef.current < THROTTLE_MS) {
        return;
    }

    try {
      if (!isSilent) setIsLoading(true);
      
      const fetchedData = await workspacesClient.getLayoutData(workspaceId);
      
      if (fetchedData) {
        setData(fetchedData);
        setTags(fetchedData.tags || []);
        lastFetchTimeRef.current = Date.now();
        setActiveWorkspaceId(workspaceId);
      }
    } catch (error) {
      console.error("Failed to fetch workspace layout:", error);
    } finally {
      if (!isSilent) setIsLoading(false);
    }
  }, [workspaceId]);

  const revalidate = useCallback(async () => {
    await fetchLayout(true); // Silent revalidation
  }, [fetchLayout]);

  const startNavigation = useCallback((callback: () => void) => {
    startTransition(() => {
      callback();
    });
  }, []);

  // Handle Workspace Switching: Reset data if workspaceId changes
  useEffect(() => {
    if (workspaceId !== activeWorkspaceId) {
        setData(null);
        setTags([]);
        setIsLoading(true);
        setActiveWorkspaceId(workspaceId);
    }
  }, [workspaceId, activeWorkspaceId]);

  useEffect(() => {
    // 1. If we have initialData, use it
    if (initialData && !(initialData as any).isError) {
      setData(initialData);
      setTags(initialData.tags || []);
      setIsLoading(false);
      lastFetchTimeRef.current = Date.now();
      return;
    } 
    
    // 2. Fetch if we don't have data OR if the data we have is for a different workspace
    if (!data || activeWorkspaceId !== workspaceId) {
      fetchLayout();
    }
  }, [workspaceId, initialData, fetchLayout, data, activeWorkspaceId]);

  // Provide a safe default for when data is loading
  const contextValue: WorkspaceLayoutContextType = {
    data: data || {
        workspaces: { workspaces: [], totalCount: 0 },
        reportStatus: null,
        projects: [],
        permissions: {
            isWorkspaceAdmin: false,
            canCreateProject: false,
            workspaceMemberId: null,
            workspaceRole: null,
            userId: null,
        }
    } as any,
    tags,
    workspaceId,
    isLoading,
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
