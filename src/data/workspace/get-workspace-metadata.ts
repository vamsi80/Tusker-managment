"use server";

import { cache } from "react";
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
export const getWorkspaceMetadata = cache(async (workspaceId: string) => {
    const user = await requireUser();

    // Verify workspace exists and user has access
    const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: {
            id: true,
            name: true,
        }
    });

    if (!workspace) {
        return null;
    }

    // Verify user is a member
    const member = await prisma.workspaceMember.findFirst({
        where: {
            workspaceId,
            userId: user.id,
        },
        select: { id: true }
    });

    if (!member) {
        return null;
    }

    return {
        id: workspace.id,
        name: workspace.name,
        userId: user.id,
    };
});

export type WorkspaceMetadata = Awaited<ReturnType<typeof getWorkspaceMetadata>>;
