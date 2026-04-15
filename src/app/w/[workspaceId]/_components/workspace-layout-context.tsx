"use client";

import React, { createContext, useContext, ReactNode, useState, useEffect } from "react";
import type { getWorkspaceLayoutData } from "@/data/workspace/get-workspace-layout-data";
import { workspacesClient } from "@/lib/api-client/workspaces";

type LayoutData = Awaited<ReturnType<typeof getWorkspaceLayoutData>>;

interface WorkspaceLayoutContextType {
  data: LayoutData;
  workspaceId: string;
  isLoading: boolean;
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
  const [isLoading, setIsLoading] = useState(!initialData);

  useEffect(() => {
    // If we have initial data (from RSC), don't fetch
    if (initialData) {
        setData(initialData);
        setIsLoading(false);
        return;
    }

    // Otherwise, fetch from Bootstrap API (Zero RSC Mode)
    async function bootstrap() {
      try {
        setIsLoading(true);
        const fetched = await workspacesClient.getLayoutData(workspaceId);
        setData(fetched);
      } catch (error) {
        console.error("Failed to bootstrap workspace layout:", error);
      } finally {
        setIsLoading(false);
      }
    }

    bootstrap();
  }, [workspaceId, initialData]);

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
    workspaceId,
    isLoading
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
