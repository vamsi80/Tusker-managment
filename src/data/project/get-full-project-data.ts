"use server";

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { notFound } from "next/navigation";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/auth/require-user";

export interface FullProjectData {
    id: string;
    name: string;
    description: string | null;
    slug: string;
    workspaceId: string;
    // Team data
    projectLead: string | null;
    memberAccess: string[];
    // Project members with full details
    projectMembers?: Array<{
        id: string;
        userId: string;
        userName: string;
        projectRole: "LEAD" | "MEMBER" | "VIEWER";
        hasAccess: boolean;
    }>;
}

/**
 * Internal function to fetch complete project data
 */
async function _getFullProjectDataInternal(projectId: string, userId: string): Promise<FullProjectData> {
    const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
            projectMembers: {
                include: {
                    workspaceMember: {
                        include: {
                            user: true,
                        },
                    },
                },
            },
            workspace: {
                include: {
                    members: true,
                },
            },
        },
    });

    if (!project) {
        notFound();
    }

    // Check user has access to this project
    const workspaceMember = project.workspace.members.find(
        (m) => m.userId === userId
    );

    if (!workspaceMember) {
        notFound();
    }

    // Find project lead (member with LEAD role)
    const projectLead = project.projectMembers.find(
        (pm) => pm.projectRole === "LEAD"
    );

    // Get all member userIds
    const memberAccess = project.projectMembers
        .filter((pm) => pm.projectRole !== "LEAD")
        .map((pm) => pm.workspaceMember.userId);

    // Map project members with full details
    const projectMembersData = project.projectMembers.map((pm) => ({
        id: pm.id,
        userId: pm.workspaceMember.userId,
        userName: pm.workspaceMember.user?.surname || "Unknown",
        projectRole: pm.projectRole,
        hasAccess: pm.hasAccess,
    }));

    return {
        id: project.id,
        name: project.name,
        description: project.description,
        slug: project.slug,
        workspaceId: project.workspaceId,
        // Team data
        projectLead: projectLead?.workspaceMember.userId || null,
        memberAccess: memberAccess,
        // Project members
        projectMembers: projectMembersData,
    };
}

/**
 * Cached version using Next.js unstable_cache
 */
const getCachedFullProjectData = (projectId: string, userId: string) =>
    unstable_cache(
        async () => _getFullProjectDataInternal(projectId, userId),
        [`full-project-${projectId}-${userId}`],
        {
            tags: [`full-project-${projectId}`, `project-${projectId}`],
            revalidate: 30 // 30 seconds - project details change more frequently
        }
    )();

/**
 * Fetch complete project data including team members
 * 
 * Note: Client data is now in a separate function `getProjectClient()`
 * 
 * Behavior:
 * - Validates user authentication
 * - Fetches complete project data with team info (cached)
 * - Checks user has access to the workspace
 * - Triggers 404 page if project not found or user doesn't have access
 * 
 * Caching Strategy:
 * 1. React cache() - Deduplicates requests within the same render
 * 2. unstable_cache() - Persists data across requests for 30 seconds
 * 
 * Cache Invalidation:
 * - Use revalidateTag(`full-project-${projectId}`) to invalidate specific project
 * - Use revalidateTag(`project-${projectId}`) to invalidate all project data
 * 
 * @param projectId - The project ID
 * @returns Complete project data (never null - triggers 404 instead)
 * @throws {notFound} When project doesn't exist or user lacks access
 * 
 * @example
 * const projectData = await getFullProjectData(projectId);
 * // Always has data here - 404 page shown if not found
 * console.log(projectData.name);
 * console.log(projectData.projectMembers);
 * 
 * // For client data, use getProjectClient separately:
 * const clientData = await getProjectClient(projectId);
 */
export const getFullProjectData = cache(async (projectId: string): Promise<FullProjectData> => {
    const user = await requireUser();

    return await getCachedFullProjectData(projectId, user.id);
});
