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

  useEffect(() => {
    // 🛡️ Data Integrity Guard: Only sync if initialData is valid.
    // We ignore "safe empty" objects (where isError is true) that may arrive 
    // during transient background re-validations (e.g. on window focus).
    if (initialData && !(initialData as any).isError) {
      setData(initialData);
      setTags(initialData.tags || []);
      setIsLoading(false);
    } else if (!data && !initialData) {
      // First load or no data at all
      fetchLayout();
    } else if (initialData && (initialData as any).isError) {
       console.warn("[WorkspaceLayout] Ignoring transient background re-validation error to preserve UI state.");
    }
  }, [workspaceId, initialData, fetchLayout, data]);

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
