"use server";

import { cache } from "react";
import { requireUser } from "@/app/data/user/require-user";
import { getProjectBySlug } from "@/app/data/project/get-project-by-slug";
import { getUserPermissions } from "@/app/data/user/get-user-permissions";
import { getProjectMembers } from "@/app/data/project/get-project-members";
import { getUserProjects } from "@/app/data/user/get-user-projects";

/**
 * Optimized data fetching for task page
 * Fetches all required data in parallel with minimal queries
 * 
 * This replaces the previous pattern where getUserProjects was called 4 times
 * and permissions were checked twice
 */
export const getTaskPageData = cache(
    async (workspaceId: string, slug: string) => {
        // Ensure user is authenticated
        const user = await requireUser();

        // Parallel fetch project and user projects
        const [project, userProjects] = await Promise.all([
            getProjectBySlug(workspaceId, slug),
            getUserProjects(workspaceId)
        ]);

        if (!project) {
            return null;
        }

        // Parallel fetch permissions and members
        const [permissions, projectMembers] = await Promise.all([
            getUserPermissions(workspaceId, project.id),
            getProjectMembers(project.id)
        ]);

        return {
            project,
            userProjects,
            permissions,
            projectMembers,
            user
        };
    }
);

export type TaskPageDataType = Awaited<ReturnType<typeof getTaskPageData>>;
