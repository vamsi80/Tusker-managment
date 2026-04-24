import { cache } from "react";
import { headers } from "next/headers";
import app from "@/hono";

/**
 * Types for workspace list data
 */
export type WorkspaceListItem = {
  id: string;
  name: string;
  slug: string | null;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
  workspaceRole: any;
  memberCount?: number;
};

export type WorkspacesResult = {
  workspaces: WorkspaceListItem[];
  totalCount: number;
};

export function invalidateWorkspacesCache(userId: string) {
  // Relying on Hono/API invalidation
}

/**
 * Public function — returns all workspaces for the current authenticated user
 * Refactored to call the Hono API internally for consistency.
 */
export const getWorkspaces = cache(async (): Promise<WorkspacesResult> => {
  try {
    const res = await app.request("/api/v1/workspaces", {
      headers: await headers(),
    });

    if (!res.ok) {
      return { workspaces: [], totalCount: 0 };
    }

    const result = await res.json();
    return result.data as WorkspacesResult;
  } catch (error) {
    console.error("Error fetching workspaces via Hono API:", error);
    return { workspaces: [], totalCount: 0 };
  }
});

/**
 * Export types for callers
 */
export type WorkspacesType = WorkspacesResult;
export type WorkspaceItemType = WorkspaceListItem;
