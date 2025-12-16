// src/app/data/workspace/require-admin.ts
import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { requireUser } from "@/data/user/require-user";
import { getUserWorkspaces } from "./get-user-workspace";

export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * Internal function that checks admin status
 */
async function _checkAdminInternal(userId: string, workspaceId: string) {
  // Load workspaces from cache-backed fetcher
  const workspacesData = await getUserWorkspaces(userId);

  // Find their membership entry
  const ws = workspacesData.workspaces.find(
    (w) => w.workspaceId === workspaceId
  );

  if (!ws) {
    return { isAdmin: false, workspace: null, error: "not_member" };
  }

  // Check ADMIN role
  if (ws.workspaceRole !== "ADMIN") {
    return { isAdmin: false, workspace: ws, error: "not_admin" };
  }

  // Valid admin
  return { isAdmin: true, workspace: ws, error: null };
}

/**
 * Cached version with Next.js unstable_cache
 */
const getCachedAdminCheck = (userId: string, workspaceId: string) =>
  unstable_cache(
    async () => _checkAdminInternal(userId, workspaceId),
    [`admin-check-${userId}-${workspaceId}`],
    {
      tags: [`admin-check-${userId}`, `workspace-admin-${workspaceId}`],
      revalidate: 60, // 1 minute
    }
  )();

/**
 * Ensures the authenticated user is an ADMIN in the given workspace.
 * Throws ForbiddenError if not admin or not a member.
 * 
 * Caching Strategy:
 * 1. React cache() - Deduplicates identical requests within the same render
 * 2. unstable_cache() - Persists data across requests for 1 minute
 * 
 * Cache Invalidation:
 * - Use revalidateTag(`admin-check-${userId}`) to invalidate for specific user
 * - Use revalidateTag(`workspace-admin-${workspaceId}`) to invalidate for workspace
 * 
 * @param workspaceId - The workspace to check admin status for
 * @returns { sessionUser, workspace }
 * @throws {ForbiddenError} When user is not admin or not a member
 * 
 * @example
 * // For server actions that require admin
 * const { sessionUser, workspace } = await requireAdmin(workspaceId);
 */
export const requireAdmin = cache(async (workspaceId: string) => {
  if (!workspaceId) {
    throw new ForbiddenError("workspaceId is required");
  }

  // 1) Ensure user is logged in
  const sessionUser = await requireUser();

  // 2) Check admin status (cached)
  const result = await getCachedAdminCheck(sessionUser.id, workspaceId);

  // 3) Handle errors
  if (!result.isAdmin) {
    if (result.error === "not_member") {
      throw new ForbiddenError("You are not a member of this workspace");
    }
    if (result.error === "not_admin") {
      throw new ForbiddenError("You must be an admin to perform this action");
    }
  }

  // ✓ Valid admin
  return {
    sessionUser,
    workspace: result.workspace!,
  };
});

/**
 * Check if the current user is an admin of the workspace.
 * Returns boolean instead of throwing errors.
 * 
 * @param workspaceId - The workspace to check admin status for
 * @returns true if user is admin, false otherwise
 * 
 * @example
 * // For conditional rendering
 * const isAdmin = await isAdminServer(workspaceId);
 * if (isAdmin) {
 *   // Show admin UI
 * }
 */
export const isAdminServer = cache(async (workspaceId: string): Promise<boolean> => {
  if (!workspaceId) {
    return false;
  }

  try {
    const sessionUser = await requireUser();
    const result = await getCachedAdminCheck(sessionUser.id, workspaceId);
    return result.isAdmin;
  } catch {
    return false;
  }
});
