"use server";

import { cache } from "react";
import { requireUser } from "@/lib/auth/require-user";
import { getProjectBySlug } from "@/data/project/get-project-by-slug";
import { getUserPermissions } from "@/data/user/get-user-permissions";
import { getProjectMembers } from "@/data/project/get-project-members";
import { getUserProjects } from "@/data/project/get-projects";
import { getWorkspaceById } from "@/data/workspace/get-workspace-by-id";
import { getWorkspaceMembers } from "@/data/workspace/get-workspace-members";

// --- EXPLICIT TYPES FOR BETTER TS DISCRIMINATION ---

export type ProjectPageData = {
    user: Awaited<ReturnType<typeof requireUser>>;
    userProjects: Awaited<ReturnType<typeof getUserProjects>>;
    project: NonNullable<Awaited<ReturnType<typeof getProjectBySlug>>>;
    permissions: Awaited<ReturnType<typeof getUserPermissions>>;
    projectMembers: Awaited<ReturnType<typeof getProjectMembers>>;
};

export type WorkspacePageData = {
    user: Awaited<ReturnType<typeof requireUser>>;
    userProjects: Awaited<ReturnType<typeof getUserProjects>>;
    workspace: NonNullable<Awaited<ReturnType<typeof getWorkspaceById>>>;
    workspaceMembers: Awaited<ReturnType<typeof getWorkspaceMembers>>;
};

/**
 * Unified data fetching for task pages (both Project and Workspace level)
 */
export const getTaskPageData = cache(
    async (workspaceId: string, slug?: string): Promise<ProjectPageData | WorkspacePageData | null> => {
        const user = await requireUser();
        const userProjects = await getUserProjects(workspaceId);

        if (slug) {
            const project = await getProjectBySlug(workspaceId, slug);
            if (!project) return null;

            const [permissions, projectMembers] = await Promise.all([
                getUserPermissions(workspaceId, project.id),
                getProjectMembers(project.id)
            ]);

            return {
                user,
                userProjects,
                project,
                permissions,
                projectMembers,
            } as ProjectPageData;
        } else {
            const workspace = await getWorkspaceById(workspaceId);
            if (!workspace) return null;

            const workspaceMembers = await getWorkspaceMembers(workspaceId);

            return {
                user,
                userProjects,
                workspace,
                workspaceMembers,
            } as WorkspacePageData;
        }
    }
);

export type TaskPageDataType = Awaited<ReturnType<typeof getTaskPageData>>;
