// src/app/data/workspace/require-admin.ts
import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { requireUser } from "@/app/data/user/require-user";
import { getUserWorkspaces } from "@/app/data/workspace/get-user-workspace";

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
      revalidate: 60 * 60 * 24, // 24 hours
    }
  )();

/**
 * Ensures the authenticated user is an ADMIN in the given workspace.
 * - Fully cached for maximum performance
 * - Throws ForbiddenError if not admin or not a member
 * - Returns { sessionUser, workspace } when valid
 *
 * You can call this 100+ times; the cached lookups are **super fast**.
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

