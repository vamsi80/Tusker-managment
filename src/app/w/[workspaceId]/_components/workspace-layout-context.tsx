"use client";

import React, { createContext, useContext, ReactNode, useState, useEffect, useCallback, useTransition, useRef } from "react";
import { WorkspaceLayoutData } from "@/types/workspace";
import { workspacesClient } from "@/lib/api-client/workspaces";
import { pusherClient } from "@/lib/pusher";
import { TEAM_UPDATE, PROJECT_UPDATE } from "@/lib/realtime";

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
  const [data, setData] = useState<WorkspaceLayoutData | null>(initialData || null);
  const [isLoading, setIsLoading] = useState(!initialData);
  const [isRevalidating, setIsRevalidating] = useState(false);
  const [isNavigating, startTransition] = useTransition();
  const lastFetchTimeRef = React.useRef<number>(initialData ? Date.now() : 0);
  const THROTTLE_MS = 15000; // 15 seconds
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(workspaceId);

  const fetchLayout = useCallback(async (isSilent = false) => {
    console.log("FETCH CALLED at", new Date().toISOString());
    // 🛡️ Throttle check: Skip if we fetched very recently (e.g. within 45s)
    if (isSilent && Date.now() - lastFetchTimeRef.current < THROTTLE_MS) {
      console.log("THROTTLED");
      return;
    }

    try {
      if (!isSilent) {
        setIsLoading(true);
      } else {
        setIsRevalidating(true);
      }

      // Add timestamp to bypass any potential intermediate caches (browser, proxy, etc.)
      const fetchedData = await workspacesClient.getLayoutData(workspaceId, Date.now());

      if (fetchedData) {
        setData(fetchedData);
        lastFetchTimeRef.current = Date.now();
        setActiveWorkspaceId(workspaceId);
      }
    } catch (error) {
      console.error("Failed to fetch workspace layout:", error);
    } finally {
      if (!isSilent) {
        setIsLoading(false);
      } else {
        setIsRevalidating(false);
      }
    }
  }, [workspaceId]);

  const revalidate = useCallback(async (force = false) => {
    // If forced, we reset the lastFetchTime to allow the fetch to proceed bypass throttle
    if (force) {
      lastFetchTimeRef.current = 0;
    }
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
      setIsLoading(true);
      setActiveWorkspaceId(workspaceId);
    }
  }, [workspaceId, activeWorkspaceId]);

  useEffect(() => {
    // 1. If we have initialData, use it
    if (initialData && !(initialData as any).isError) {
      setData(initialData);
      setIsLoading(false);
      lastFetchTimeRef.current = Date.now();
      return;
    }

    // 2. Fetch if we don't have data OR if the data we have is for a different workspace
    if (!data || activeWorkspaceId !== workspaceId) {
      fetchLayout();
    }
  }, [workspaceId, initialData, fetchLayout, data, activeWorkspaceId]);

  // 📡 Real-time Updates: Listen for project and team changes
  useEffect(() => {
    if (!pusherClient || !workspaceId) return;

    const channelName = `team-${workspaceId}`;
    console.log(`🔌 Pusher: Subscribing to channel: ${channelName}`);
    const channel = pusherClient.subscribe(channelName);

    channel.bind("pusher:subscription_succeeded", () => {
      console.log(`✅ Pusher: Subscribed successfully to ${channelName}`);
    });

    channel.bind("pusher:subscription_error", (err: any) => {
      console.error(`❌ Pusher: Subscription error for ${channelName}:`, err);
    });

    // Listen for team-level updates (roles, permissions, new members)
    channel.bind(TEAM_UPDATE, (data: any) => {
      console.log("📡 Real-time: Team update received:", data.type);
      revalidate(true);
    });

    // Listen for project changes (creation, deletion, etc)
    channel.bind(PROJECT_UPDATE, (eventData: any) => {
      console.log("📡 Real-time: Project update received:", eventData.type, eventData.projectId);
      
      // Optimistically handle deletion to ensure immediate removal from UI
      if (eventData.type === "DELETE" && eventData.projectId) {
        setData(prev => {
          if (!prev) return prev;
          console.log("🚀 Optimistic: Removing project", eventData.projectId);
          return {
            ...prev,
            projects: prev.projects.filter(p => p.id !== eventData.projectId)
          };
        });
      }

      // Optimistically handle creation to ensure immediate appearance in UI
      if (eventData.type === "CREATE" && eventData.payload) {
        setData(prev => {
          if (!prev) return prev;
          // Avoid duplicates
          if (prev.projects.some(p => p.id === eventData.payload.id)) return prev;
          console.log("🚀 Optimistic: Adding project", eventData.payload.name);
          return {
            ...prev,
            projects: [...prev.projects, eventData.payload]
          };
        });
      }

      console.log("📡 Real-time: Forcing revalidation in 500ms...");
      setTimeout(() => {
        revalidate(true);
      }, 500);
    });

    return () => {
      console.log(`🔌 Pusher: Unsubscribing from channel: ${channelName}`);
      pusherClient?.unsubscribe(channelName);
    };
  }, [workspaceId, revalidate]);

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
        leadProjectIds: [],
        managedProjectIds: [],
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
