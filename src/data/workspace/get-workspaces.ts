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

const WORKSPACES_MEMORY_CACHE = new Map<string, { data: any, timestamp: number }>();
const MEMORY_TTL = 30000; // 30 seconds

function getMemoryWorkspaces(key: string) {
    const cached = WORKSPACES_MEMORY_CACHE.get(key);
    if (cached && Date.now() - cached.timestamp < MEMORY_TTL) return cached.data;
    return null;
}

function setMemoryWorkspaces(key: string, data: any) {
    WORKSPACES_MEMORY_CACHE.set(key, { data, timestamp: Date.now() });
    if (WORKSPACES_MEMORY_CACHE.size > 100) WORKSPACES_MEMORY_CACHE.clear();
}
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
const getCachedWorkspaces = (userId: string, bypass: boolean) => {
    const cacheKey = `user-workspaces-${userId}`;

    // 1. Memory
    const memory = getMemoryWorkspaces(cacheKey);
    if (memory) return Promise.resolve(memory);

    // 2. Bypass
    if (bypass) {
        return _fetchWorkspacesInternal(userId).then(res => {
            setMemoryWorkspaces(cacheKey, res);
            return res;
        });
    }

    // 3. Disk
    return unstable_cache(
        async () => _fetchWorkspacesInternal(userId),
        [cacheKey],
        {
            tags: CacheTags.userWorkspaces(userId),
            revalidate: 60, // 1 minute
        }
    )().then(res => {
        setMemoryWorkspaces(cacheKey, res);
        return res;
    });
};

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
export const getWorkspaces = cache(async (providedUserId?: string): Promise<WorkspacesResult> => {
    // Ensure authenticated user
    const userId = providedUserId || (await requireUser()).id;
    if (!userId) {
        return notFound();
    }

    // Fetch workspaces (cached with bypass support)
    const result = await getCachedWorkspaces(userId, !!providedUserId);

    return result;
});

/**
 * Export types for callers
 */
export type WorkspacesType = WorkspacesResult;
export type WorkspaceItemType = WorkspaceListItem;
