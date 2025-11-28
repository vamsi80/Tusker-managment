// src/app/data/workspace/get-user-workspace.ts
import { cache } from "react";
import prisma from "@/lib/db";
import { NotFoundError } from "../user/errors";

/**
 * Types - adjust to match your Prisma schema if necessary
 */
type WorkspaceSelect = {
  workspaceId: string;
  accessLevel: string | null;
  workspace: { id: string; name: string | null; slug: string | null };
};

type UserWorkspacesResult = {
  id: string;
  workspaces: WorkspaceSelect[];
};

/**
 * TTL config
 */
const DEFAULT_TTL_SECONDS = Number(process.env.WORKSPACE_CACHE_TTL ?? 60);
const CACHE_CLEAN_INTERVAL = 1000 * 60 * 5; // 5 minutes

type CacheEntry = { value: UserWorkspacesResult; expiresAt: number };
const cacheMap = new Map<string, CacheEntry>();

let cleanupScheduled = false;
function scheduleCleanup() {
  if (cleanupScheduled) return;
  cleanupScheduled = true;
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of cacheMap.entries()) {
      if (entry.expiresAt <= now) cacheMap.delete(key);
    }
  }, CACHE_CLEAN_INTERVAL);
}
scheduleCleanup();

/**
 * Exported invalidation helper — call this after you modify a user's workspace membership.
 */
export function invalidateWorkspaceCacheForUser(userId: string) {
  if (!userId) return;
  cacheMap.delete(userId);
}

/**
 * Stable DB fetcher wrapped with react's cache for stable identity across HMR
 */
export const _fetchUserWorkspaces = cache(
  async (userId: string): Promise<UserWorkspacesResult | null> => {
    const data = await prisma.user.findFirst({
      where: { id: userId },
      select: {
        id: true,
        workspaces: {
          select: {
            workspaceId: true,
            accessLevel: true,
            workspace: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        },
      },
    });
    return data as UserWorkspacesResult | null;
  }
);

/**
 * Public accessor: always requires a valid sessionUserId (non-empty)
 * Throws NotFoundError if user missing.
 */
export async function getUserWorkspaces(
  sessionUserId: string,
  options?: { ttlSeconds?: number }
) {
  const ttlSeconds = options?.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const now = Date.now();

  const cached = cacheMap.get(sessionUserId);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const result = await _fetchUserWorkspaces(sessionUserId);
  if (!result) {
    throw new NotFoundError(`User ${sessionUserId} not found`);
  }

  cacheMap.set(sessionUserId, {
    value: result,
    expiresAt: now + ttlSeconds * 1000,
  });

  return result;
}
