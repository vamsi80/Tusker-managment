// src/app/data/workspace/get-workspace-projects.ts
import { cache } from "react";
import { notFound } from "next/navigation";
import prisma from "@/lib/db";
import { requireUser } from "../user/require-user";

/**
 * Types (adjust to match your Prisma schema if necessary)
 */
export type WorkspaceMemberRow = {
  id: string;
  workspaceId: string;
  userId: string;
  workspaceRole: string;
  projectAccess?: { id: string; projectId: string }[];
  user?: { id: string; name?: string | null; surname?: string | null; email: string; image?: string | null; contactNumber?: string | null };
};

export type ProjectRow = {
  id: string;
  name: string;
  slug: string | null;
};

export type WorkspaceProjectsResult = {
  workspaceMembers: WorkspaceMemberRow[];
  projects: ProjectRow[];
};

/**
 * Cache configuration
 */
const DEFAULT_TTL_SECONDS = Number(process.env.WORKSPACE_PROJECTS_CACHE_TTL ?? 60); // default 60s
const CACHE_CLEAN_INTERVAL_MS = 1000 * 60 * 5; // cleanup every 5 minutes

type CacheEntry = {
  value: WorkspaceProjectsResult;
  expiresAt: number;
};

const workspaceCache = new Map<string, CacheEntry>();

// Schedule periodic cleanup of expired entries to avoid memory growth.
let cleanupScheduled = false;
function scheduleCleanup() {
  if (cleanupScheduled) return;
  cleanupScheduled = true;
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of workspaceCache.entries()) {
      if (v.expiresAt <= now) workspaceCache.delete(k);
    }
  }, CACHE_CLEAN_INTERVAL_MS);
}
scheduleCleanup();

/**
 * Invalidate cache for a workspace (call this after any mutation that changes members/projects)
 */
export function invalidateWorkspaceCacheForWorkspace(workspaceId: string) {
  if (!workspaceId) return;
  workspaceCache.delete(workspaceId);
}

/**
 * Stable DB fetcher identity (useful with React caching/hmr)
 * We keep it simple: returns the raw data from DB.
 */
export const _fetchWorkspaceMembersAndProjects = cache(
  async (workspaceId: string): Promise<WorkspaceProjectsResult> => {
    const [workspaceMembers, projects] = await Promise.all([
      prisma.workspaceMember.findMany({
        where: { workspaceId },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              surname: true,
              contactNumber: true,
              email: true,
              image: true,
            },
          },
          projectAccess: {
            select: {
              id: true,
              projectId: true,
            },
          },
        },
      }),
      prisma.project.findMany({
        where: { workspaceId },
        select: {
          id: true,
          name: true,
          slug: true,
        },
      }),
    ]);

    // normalize shapes to the export types
    const members = workspaceMembers.map((m) => ({
      id: m.id,
      workspaceId: m.workspaceId,
      userId: m.userId,
      workspaceRole: m.workspaceRole,
      projectAccess: m.projectAccess ?? [],
      user: m.user ?? undefined,
    }));

    const projs = projects.map((p) => ({ id: p.id, name: p.name, slug: p.slug }));

    return { workspaceMembers: members, projects: projs };
  }
);

/**
 * Public function — returns workspace members + projects for given workspaceId
 *
 * Behavior:
 * - Validates user via requireUser()
 * - If cache hit: checks membership in cached members and returns cached data
 * - If cache miss: fetches members+projects from DB (in parallel), checks membership,
 *   caches the result (only if user is a member), and returns the data.
 *
 * IMPORTANT: Call invalidateWorkspaceCacheForWorkspace(workspaceId) after you:
 *  - add/remove workspace members
 *  - change a member's projectAccess
 *  - create/delete/rename projects in the workspace
 */
export async function getWorkspacesProjectsByWorkspaceId(
  workspaceId: string
): Promise<WorkspaceProjectsResult> {
  if (!workspaceId) {
    throw new Error("workspaceId is required");
  }

  // ensure authenticated user (requireUser should throw if unauthenticated)
  const user = await requireUser();
  if (!user?.id) {
    // Defensive: requireUser should throw but in case it returned malformed session
    return notFound();
  }

  const now = Date.now();
  const cached = workspaceCache.get(workspaceId);
  if (cached && cached.expiresAt > now) {
    // check membership using cached members
    const isMember = cached.value.workspaceMembers.some((m) => m.userId === user.id);
    if (!isMember) {
      // user is not a member -> 404 as your original logic
      return notFound();
    }
    return cached.value;
  }

  // Cache miss -> fetch from DB (members + projects in parallel)
  const result = await _fetchWorkspaceMembersAndProjects(workspaceId);

  // Verify current user is a member of the workspace
  const isUserMember = result.workspaceMembers.some((m) => m.userId === user.id);
  if (!isUserMember) {
    // user not a member -> do not cache; return 404
    return notFound();
  }

  // Cache the result for TTL seconds
  const ttlSeconds = Number(process.env.WORKSPACE_PROJECTS_CACHE_TTL ?? DEFAULT_TTL_SECONDS);
  workspaceCache.set(workspaceId, {
    value: result,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });

  // Filter projects based on user access
  // 1. Find the current user's member record
  const currentMember = result.workspaceMembers.find((m) => m.userId === user.id);

  // 2. If somehow not found (though we checked isUserMember above), return empty or original
  if (!currentMember) {
    return result;
  }

  // 3. Filter projects
  //    - If ADMIN, show all
  //    - Else, show only if user has projectAccess entry for that project
  const filteredProjects = result.projects.filter((p) => {
    if (currentMember.workspaceRole === "ADMIN") {
      return true;
    }
    // Check if user has any projectAccess entry for this project
    const access = currentMember.projectAccess?.find((a) => a.projectId === p.id);
    return !!access;
  });

  return {
    ...result,
    projects: filteredProjects,
  };
}

/**
 * Export types for callers
 */
export type WorkspaceProjectsType = NonNullable<
  Awaited<ReturnType<typeof getWorkspacesProjectsByWorkspaceId>>
>;
export type WorkspaceMemberType = WorkspaceProjectsType["workspaceMembers"][number];
export type ProjectType = WorkspaceProjectsType["projects"][number];
