// src/data/workspace/get-workspace-by-id.ts
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { notFound } from "next/navigation";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/auth/require-user";
import { CacheTags } from "@/data/cache-tags";
import { WorkspaceRole } from "@/generated/prisma/client";

/**
 * Types for workspace data
 */
export type WorkspaceData = {
    id: string;
    name: string;
    ownerId: string;
    createdAt: Date;
    updatedAt: Date;
    members?: {
        id: string;
        userId: string;
        workspaceId: string;
        workspaceRole: WorkspaceRole;
        user?: {
            id: string;
            name?: string | null;
            surname?: string | null;
            email: string;
            image?: string | null;
        };
    }[];
};

/**
 * Internal function that fetches workspace by ID
 */
async function _fetchWorkspaceByIdInternal(workspaceId: string): Promise<WorkspaceData | null> {
    const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: {
            id: true,
            name: true,
            ownerId: true,
            createdAt: true,
            updatedAt: true,
            members: {
                select: {
                    id: true,
                    userId: true,
                    workspaceId: true,
                    workspaceRole: true,
                    user: {
                        select: {
                            id: true,
                            name: true,
                            surname: true,
                            email: true,
                            image: true,
                        },
                    },
                },
            },
        },
    });

    return workspace;
}

/**
 * Cached version with Next.js unstable_cache
 */
const getCachedWorkspaceById = (workspaceId: string) =>
    unstable_cache(
        async () => _fetchWorkspaceByIdInternal(workspaceId),
        [`workspace-${workspaceId}`],
        {
            tags: CacheTags.workspace(workspaceId),
            revalidate: 60 * 60 * 24, // 24 hours
        }
    )();

/**
 * Public function — returns workspace data for given workspaceId
 *
 * Behavior:
 * - Validates user via requireUser()
 * - Fetches workspace data (cached)
 * - Verifies user is a member of the workspace
 * - Returns workspace data or notFound()
 */
export const getWorkspaceById = cache(async (workspaceId: string): Promise<WorkspaceData> => {
    if (!workspaceId) {
        throw new Error("workspaceId is required");
    }

    // Ensure authenticated user
    const user = await requireUser();
    if (!user?.id) {
        return notFound();
    }

    // Fetch workspace data (cached)
    const workspace = await getCachedWorkspaceById(workspaceId);

    if (!workspace) {
        return notFound();
    }

    // Verify current user is a member of the workspace
    const isUserMember = workspace.members?.some((m) => m.userId === user.id);
    if (!isUserMember) {
        return notFound();
    }

    return workspace;
});

/**
 * Export types for callers
 */
export type WorkspaceType = WorkspaceData;
