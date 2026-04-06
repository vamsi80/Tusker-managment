// src/app/data/workspace/get-workspace-members.ts
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { notFound } from "next/navigation";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/auth/require-user";
import { CacheTags } from "@/data/cache-tags";

/**
 * Types (adjust to match your Prisma schema if necessary)
 */
export type WorkspaceMemberRow = {
  id: string;
  workspaceId: string;
  userId: string;
  workspaceRole: string;
  projectMembers?: { id: string; projectId: string }[];
  user?: {
    id: string;
    name?: string | null;
    surname?: string | null;
    email: string;
    image?: string | null;
    contactNumber?: string | null
  };
};

export type WorkspaceMembersResult = {
  workspaceMembers: WorkspaceMemberRow[];
};

/**
 * Internal function that fetches workspace members
 */
async function _fetchWorkspaceMembersInternal(workspaceId: string): Promise<WorkspaceMembersResult> {
  const workspaceMembers = await prisma.workspaceMember.findMany({
    where: { workspaceId },
    select: {
      id: true,
      workspaceId: true,
      userId: true,
      workspaceRole: true,
      projectMembers: {
        select: {
          id: true,
          projectId: true,
        },
      },
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
    },
  });

  // Normalize shapes to the export types
  const members = workspaceMembers.map((m) => ({
    id: m.id,
    workspaceId: m.workspaceId,
    userId: m.userId,
    workspaceRole: m.workspaceRole,
    projectMembers: m.projectMembers ?? [],
    user: m.user ?? undefined,
  }));

  return { workspaceMembers: members };
}

/**
 * Cached version with Next.js unstable_cache
 */
const getCachedWorkspaceMembers = (workspaceId: string) =>
  unstable_cache(
    async () => _fetchWorkspaceMembersInternal(workspaceId),
    [`workspace-members-${workspaceId}`],
    {
      tags: CacheTags.workspaceMembers(workspaceId),
      revalidate: 60 * 60 * 12, // 12 hours
    }
  )();

/**
 * Public function — returns workspace members for given workspaceId
 *
 * Behavior:
 * - Validates user via requireUser()
 * - Fetches workspace members (cached)
 * - Verifies user is a member of the workspace
 * - Returns workspace members
 */
export const getWorkspaceMembers = cache(async (workspaceId: string): Promise<WorkspaceMembersResult> => {
  if (!workspaceId) {
    throw new Error("workspaceId is required");
  }

  // Ensure authenticated user
  const user = await requireUser();
  if (!user?.id) {
    return notFound();
  }

  // Fetch workspace members (cached)
  const result = await getCachedWorkspaceMembers(workspaceId);

  // Verify current user is a member of the workspace
  const isUserMember = result.workspaceMembers.some((m) => m.userId === user.id);
  if (!isUserMember) {
    return notFound();
  }

  return result;
});

/**
 * Export types for callers
 */
export type WorkspaceMembersType = WorkspaceMemberRow[];
