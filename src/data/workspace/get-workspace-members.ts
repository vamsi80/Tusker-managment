import { cache } from "react";
import { unstable_cache } from "next/cache";
import { notFound } from "next/navigation";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/auth/require-user";
import { CacheTags } from "@/data/cache-tags";

export type WorkspaceMemberRow = {
  id: string;
  workspaceId: string;
  userId: string;
  workspaceRole: string;
  designation?: string | null;
  reportToId?: string | null;
  user?: {
    id: string;
    name?: string | null;
    surname?: string | null;
    email: string;
    emailVerified: boolean;
    image?: string | null;
    contactNumber?: string | null;
    phoneNumber?: string | null;
    _count?: {
      accounts: number;
    };
  } | null;
  reportTo?: {
    user: {
      name: string | null;
      surname: string | null;
    };
  } | null;
};

export type WorkspaceMembersResult = {
  workspaceMembers: WorkspaceMemberRow[];
};

async function _fetchWorkspaceMembersInternal(workspaceId: string): Promise<WorkspaceMembersResult> {
  const workspaceMembers = await prisma.workspaceMember.findMany({
    where: { workspaceId },
    select: {
      id: true,
      workspaceId: true,
      userId: true,
      workspaceRole: true,
      designation: true,
      reportToId: true,
      user: {
        select: {
          id: true,
          name: true,
          surname: true,
          phoneNumber: true,
          email: true,
          emailVerified: true,
          _count: {
            select: {
              accounts: true,
            }
          }
        },
      },
      reportTo: {
        select: {
          user: {
            select: {
              name: true,
              surname: true,
            },
          },
        },
      },
    },
  });

  const members = workspaceMembers.map((m) => ({
    id: m.id,
    workspaceId: m.workspaceId,
    userId: m.userId,
    workspaceRole: m.workspaceRole,
    designation: m.designation,
    reportToId: m.reportToId,
    reportTo: m.reportTo,
    user: m.user ?? undefined,
  }));

  return { workspaceMembers: members };
}

const getCachedWorkspaceMembers = (workspaceId: string) =>
  unstable_cache(
    async () => _fetchWorkspaceMembersInternal(workspaceId),
    [`workspace-members-v4-${workspaceId}`],
    {
      tags: CacheTags.workspaceMembers(workspaceId),
      revalidate: 60, // 60 seconds
    }
  )();

export const getWorkspaceMembers = cache(async (workspaceId: string): Promise<WorkspaceMembersResult> => {
  if (!workspaceId) {
    throw new Error("workspaceId is required");
  }

  const user = await requireUser();
  if (!user?.id) {
    return notFound();
  }

  const result = await getCachedWorkspaceMembers(workspaceId);

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
