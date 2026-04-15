import { cache } from "react";
import { WorkspaceService } from "@/server/services/workspace.service";
import { requireUser } from "@/lib/auth/require-user";

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
 * Now calls WorkspaceService directly for server-side efficiency.
 */
export const getWorkspaces = cache(async (): Promise<WorkspacesResult> => {
  try {
    const user = await requireUser();
    const result = await WorkspaceService.getWorkspaces(user.id);
    return result as WorkspacesResult;
  } catch (error) {
    console.error("Error fetching workspaces via Service:", error);
    return { workspaces: [], totalCount: 0 };
  }
});

/**
 * Export types for callers
 */
export type WorkspacesType = WorkspacesResult;
export type WorkspaceItemType = WorkspaceListItem;
