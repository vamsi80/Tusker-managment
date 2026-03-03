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
    try {
        const user = await requireUser();

        // Get basic project info (already cached)
        const project = await getProjectBySlug(workspaceId, slug);

        if (!project) {
            return null;
        }

        // Get user permissions using the project's actual workspaceId to avoid slug/id mismatches
        const permissions = await getUserPermissions(project.workspaceId, project.id);

        // Security check:
        // 1. User must be a member of the workspace (workspaceMemberId must exist)
        // 2. User must have access:
        //    - Either they are a Workspace Admin/Owner
        //    - Or they are explicitly added to the project (projectMember exists)
        if (!permissions.workspaceMemberId) {
            return null;
        }

        const hasAccess = permissions.isWorkspaceAdmin || !!permissions.projectMember;

        if (!hasAccess) {
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
    } catch (error) {
        console.error("Error in getProjectMetadata:", error);
        return null;
    }
});

export type ProjectMetadata = Awaited<ReturnType<typeof getProjectMetadata>>;
