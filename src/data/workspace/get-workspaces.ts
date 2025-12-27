// src/data/workspace/get-workspaces.ts
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { notFound } from "next/navigation";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/auth/require-user";
import { WorkspaceRole } from "@/generated/prisma/client";
import { CacheTags } from "@/data/cache-tags";

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
    workspaceRole: WorkspaceRole;
    memberCount?: number;
};

export type WorkspacesResult = {
    workspaces: WorkspaceListItem[];
    totalCount: number;
};

/**
 * Internal function that fetches all workspaces for a user
 */
async function _fetchWorkspacesInternal(userId: string): Promise<WorkspacesResult> {
    // Fetch user's workspace memberships
    const workspaceMemberships = await prisma.workspaceMember.findMany({
        where: { userId },
        select: {
            workspaceId: true,
            workspaceRole: true,
            workspace: {
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    ownerId: true,
                    createdAt: true,
                    updatedAt: true,
                    _count: {
                        select: {
                            members: true,
                        },
                    },
                },
            },
        },
        orderBy: {
            createdAt: "desc",
        },
    });

    // Transform to WorkspaceListItem format
    const workspaces: WorkspaceListItem[] = workspaceMemberships.map((membership) => ({
        id: membership.workspace.id,
        name: membership.workspace.name,
        slug: membership.workspace.slug,
        ownerId: membership.workspace.ownerId,
        createdAt: membership.workspace.createdAt,
        updatedAt: membership.workspace.updatedAt,
        workspaceRole: membership.workspaceRole,
        memberCount: membership.workspace._count.members,
    }));

    return {
        workspaces,
        totalCount: workspaces.length,
    };
}

/**
 * Cached version with Next.js unstable_cache
 */
const getCachedWorkspaces = (userId: string) =>
    unstable_cache(
        async () => _fetchWorkspacesInternal(userId),
        [`user-workspaces-${userId}`],
        {
            tags: CacheTags.userWorkspaces(userId),
            revalidate: 60, // 1 minute
        }
    )();

/**
 * Public function — returns all workspaces for the current authenticated user
 *
 * Behavior:
 * - Validates user via requireUser()
 * - Fetches all workspaces where user is a member (cached)
 * - Returns workspaces with user's role in each workspace
 * - Includes member count for each workspace
 * - Ordered by creation date (newest first)
 *
 * @returns WorkspacesResult containing array of workspaces and total count
 *
 * @example
 * const { workspaces, totalCount } = await getWorkspaces();
 * workspaces.forEach(ws => {
 *   console.log(`${ws.name} - Role: ${ws.workspaceRole}`);
 * });
 */
export const getWorkspaces = cache(async (): Promise<WorkspacesResult> => {
    // Ensure authenticated user
    const user = await requireUser();
    if (!user?.id) {
        return notFound();
    }

    // Fetch workspaces (cached)
    const result = await getCachedWorkspaces(user.id);

    return result;
});

/**
 * Export types for callers
 */
export type WorkspacesType = WorkspacesResult;
export type WorkspaceItemType = WorkspaceListItem;
