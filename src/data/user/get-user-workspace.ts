// src/app/data/workspace/get-user-workspace.ts
import { cache } from "react";
import { unstable_cache } from "next/cache";
import prisma from "@/lib/db";
import { NotFoundError } from "@/lib/errors/auth-errors";

/**
 * Types - adjust to match your Prisma schema if necessary
 */
type WorkspaceSelect = {
  workspaceId: string;
  workspaceRole: string | null;
  workspace: { id: string; name: string | null; slug: string | null };
};

type UserWorkspacesResult = {
  id: string;
  workspaces: WorkspaceSelect[];
};

/**
 * Internal function that does the actual data fetching
 */
async function _fetchUserWorkspacesInternal(userId: string): Promise<UserWorkspacesResult | null> {
  const data = await prisma.user.findFirst({
    where: { id: userId },
    select: {
      id: true,
      workspaces: {
        select: {
          workspaceId: true,
          workspaceRole: true,
          workspace: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      },
    },
  });
  return data as UserWorkspacesResult | null;
}

/**
 * Cached version with Next.js unstable_cache (persists across requests)
 */
const getCachedUserWorkspaces = (userId: string) =>
  unstable_cache(
    async () => _fetchUserWorkspacesInternal(userId),
    [`user-workspaces-${userId}`],
    {
      tags: [`user-workspaces-${userId}`],
      revalidate: 60, // Revalidate every 60 seconds
    }
  )();

/**
 * React cache wrapper (deduplicates requests within the same render)
 * Public accessor: always requires a valid sessionUserId (non-empty)
 * Throws NotFoundError if user missing.
 */
export const getUserWorkspaces = cache(async (sessionUserId: string) => {
  const result = await getCachedUserWorkspaces(sessionUserId);

  if (!result) {
    throw new NotFoundError(`User ${sessionUserId} not found`);
  }

  return result;
});

export type UserWorkspacesType = Awaited<ReturnType<typeof getUserWorkspaces>>;
