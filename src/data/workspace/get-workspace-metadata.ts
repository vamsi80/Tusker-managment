"use server";

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { requireUser } from "@/lib/auth/require-user";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";
import prisma from "@/lib/db";
import { notFound } from "next/navigation";

/**
 * Lightweight workspace metadata for layouts
 * ONLY fetches minimal, static data needed for structure
 * 
 * This is layout-safe because it:
 * - Is wrapped in cache()
 * - Only fetches workspace name and ID
 * - Does NOT fetch mutable business data
 */
/**
 * Internal function to fetch metadata
 */
async function _getWorkspaceMetadataInternal(workspaceId: string, userId: string) {
    // Verify workspace exists and user has access
    const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: {
            id: true,
            name: true,
        }
    });

    if (!workspace) return null;

    // Verify user is a member
    const member = await prisma.workspaceMember.findFirst({
        where: {
            workspaceId,
            userId,
        },
        select: { id: true }
    });

    if (!member) return null;

    return {
        id: workspace.id,
        name: workspace.name,
        userId: userId,
    };
}

/**
 * Public function — returns lightweight workspace metadata
 */
export const getWorkspaceMetadata = cache(async (workspaceId: string) => {
    const user = await requireUser();

    // Use unstable_cache for production speed
    const fetchMetadata = unstable_cache(
        async () => _getWorkspaceMetadataInternal(workspaceId, user.id),
        [`workspace-metadata-${workspaceId}-${user.id}`],
        {
            tags: ["workspace-metadata", `workspace-${workspaceId}`],
            revalidate: 3600, // 1 hour - metadata rarely changes
        }
    );

    return fetchMetadata();
});

export type WorkspaceMetadata = Awaited<ReturnType<typeof getWorkspaceMetadata>>;
