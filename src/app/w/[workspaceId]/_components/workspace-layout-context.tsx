"use client";

import React, { createContext, useContext, ReactNode, useState, useEffect, useCallback } from "react";
import type { getWorkspaceLayoutData } from "@/data/workspace/get-workspace-layout-data";
import { workspacesClient } from "@/lib/api-client/workspaces";

type LayoutData = Awaited<ReturnType<typeof getWorkspaceLayoutData>>;

interface WorkspaceLayoutContextType {
  data: LayoutData;
  tags: any[];
  workspaceId: string;
  isLoading: boolean;
  kanbanMetadata: { projectLeadersMap: Record<string, any[]>; projectMembersMap: Record<string, any[]> } | null;
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
  const [tags, setTags] = useState<any[]>([]);
  const [kanbanMetadata, setKanbanMetadata] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(!initialData);

  const fetchLayout = useCallback(async (isSilent = false) => {
    try {
      if (!isSilent) setIsLoading(true);
      
      // Fetch core layout and metadata in parallel, but handle tags and kanban independently for resilience
      const [fetchedData, fetchedTags, fetchedKanban] = await Promise.allSettled([
        workspacesClient.getLayoutData(workspaceId),
        workspacesClient.getTags(workspaceId),
        workspacesClient.getKanbanData(workspaceId)
      ]);

      if (fetchedData.status === "fulfilled") {
        setData(fetchedData.value);
      }
      
      if (fetchedTags.status === "fulfilled") {
        setTags(fetchedTags.value || []);
      }

      if (fetchedKanban.status === "fulfilled") {
        setKanbanMetadata(fetchedKanban.value || null);
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

  useEffect(() => {
    if (initialData) {
      setData(initialData);
      setIsLoading(false);
      // Trigger background fetch for metadata not included in initialData
      fetchLayout(true);
    } else {
      fetchLayout();
    }
  }, [workspaceId, initialData, fetchLayout]);

  // Provide a safe default for when data is loading
  const contextValue: WorkspaceLayoutContextType = {
    data: data || {
        user: null as any,
        workspaces: { workspaces: [], totalCount: 0 },
        metadata: null,
        reportStatus: null,
        projects: [],
        unreadNotificationsCount: 0,
        permissions: {
            isWorkspaceAdmin: false,
            canCreateProject: false,
            workspaceMemberId: null,
            workspaceRole: null,
            userId: null,
        }
    },
    tags,
    kanbanMetadata,
    workspaceId,
    isLoading,
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
