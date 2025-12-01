// src/app/data/workspace/require-admin.ts
import "server-only";
import { requireUser } from "@/app/data/user/require-user";
import { getUserWorkspaces } from "@/app/data/workspace/get-user-workspace";

export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * Ensures the authenticated user is an ADMIN in the given workspace.
 * - Fully compatible with your caching system (getUserWorkspaces)
 * - Throws ForbiddenError if not admin or not a member
 * - Returns { sessionUser, workspace } when valid
 *
 * You can call this 100+ times; the cached workspace lookups are **super fast**.
 */
export async function requireAdmin(workspaceId: string) {
  if (!workspaceId) {
    throw new ForbiddenError("workspaceId is required");
  }

  // 1) Ensure user is logged in
  const sessionUser = await requireUser();

  // 2) Load workspaces from cache-backed fetcher
  const workspacesData = await getUserWorkspaces(sessionUser.id);

  // 3) Find their membership entry
  const ws = workspacesData.workspaces.find(
    (w) => w.workspaceId === workspaceId
  );

  if (!ws) {
    throw new ForbiddenError("You are not a member of this workspace");
  }

  // 4) Enforce ADMIN role
  if (ws.workspaceRole !== "ADMIN") {
    throw new ForbiddenError("You must be an admin to perform this action");
  }

  // ✓ Valid admin
  return {
    sessionUser,
    workspace: ws,
  };
}
