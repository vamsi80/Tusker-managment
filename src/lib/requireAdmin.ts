// src/lib/requireAdmin.ts
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { requireUser } from "@/app/data/user/require-user";
import { getUserWorkspaces } from "@/app/data/workspace/get-user-workspace";

/**
 * Internal function to check admin status
 */
async function _checkAdminStatus(userId: string, workspaceId: string): Promise<boolean> {
  const data = await getUserWorkspaces(userId);
  const ws = data.workspaces.find((w) => w.workspaceId === workspaceId);
  return ws?.workspaceRole === "ADMIN";
}

/**
 * Cached version with Next.js unstable_cache
 * - Persists across requests for 5 minutes
 * - Tagged for targeted invalidation
 */
const getCachedAdminStatus = (userId: string, workspaceId: string) =>
  unstable_cache(
    async () => _checkAdminStatus(userId, workspaceId),
    [`admin-status-${userId}-${workspaceId}`],
    {
      tags: [`admin-check-${userId}`, `workspace-admin-${workspaceId}`],
      revalidate: 300, // 5 minutes
    }
  )();

/**
 * Check if the current user is an admin of the workspace
 * 
 * Caching Strategy:
 * 1. React cache() - Deduplicates identical requests within the same render
 * 2. unstable_cache() - Persists data across requests for 5 minutes
 * 
 * Cache Invalidation:
 * - Use revalidateTag(`admin-check-${userId}`) to invalidate for specific user
 * - Use revalidateTag(`workspace-admin-${workspaceId}`) to invalidate for workspace
 * 
 * @param workspaceId - The workspace to check admin status for
 * @returns true if user is admin, false otherwise
 */
export const requireAdmin = cache(async (workspaceId: string): Promise<boolean> => {
  const sessionUser = await requireUser(); // will redirect if unauthenticated
  return getCachedAdminStatus(sessionUser.id, workspaceId);
});

// Keep old name as alias for backward compatibility (deprecated)
export const isAdminServer = requireAdmin;

