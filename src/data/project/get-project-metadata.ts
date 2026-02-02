"use server";

import { cache } from "react";
import { requireUser } from "@/lib/auth/require-user";
import { getProjectBySlug } from "@/data/project/get-project-by-slug";
import { getUserPermissions } from "@/data/user/get-user-permissions";

/**
 * Lightweight project metadata for layouts
 * ONLY fetches minimal, static data needed for structure
 * 
 * This is layout-safe because it:
 * - Is wrapped in cache()
 * - Only fetches project name, ID, slug, color
 * - Does NOT fetch mutable business data (tasks, members lists, etc.)
 */
export const getProjectMetadata = cache(async (workspaceId: string, slug: string) => {
    const user = await requireUser();

    // Get basic project info (already cached)
    const project = await getProjectBySlug(workspaceId, slug);

    if (!project) {
        return null;
    }

    // Get user permissions (already cached)
    const permissions = await getUserPermissions(workspaceId, project.id);

    if (!permissions.workspaceMemberId) {
        return null;
    }

    return {
        id: project.id,
        name: project.name,
        slug: project.slug,
        color: project.color,
        workspaceId: project.workspaceId,
        userId: user.id,
        canPerformBulkOperations: permissions.canPerformBulkOperations,
    };
});

export type ProjectMetadata = Awaited<ReturnType<typeof getProjectMetadata>>;
