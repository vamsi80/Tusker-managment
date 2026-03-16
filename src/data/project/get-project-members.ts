"use server";

import { cache } from "react";
import { unstable_cache } from "next/cache";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/auth/require-user";
import { CacheTags, combineTags } from "@/data/cache-tags";

import { ProjectRole } from "@/generated/prisma";

/**
 * NormalMember shape for UI components
 */
export type NormalMember = {
    id: string; // userId
    userId: string;
    projectRole?: ProjectRole;
    user: {
        id: string;
        surname: string | null;
        email?: string;
    }
};

/**
 * Internal function to fetch project members
 * Supports both single project and workspace-wide unique members
 */
async function _getProjectMembersInternal(params: { projectId?: string; workspaceId?: string }) {
    const { projectId, workspaceId } = params;

    if (!projectId && !workspaceId) {
        throw new Error("Either projectId or workspaceId must be provided");
    }

    const projectMembers = await prisma.projectMember.findMany({
        where: projectId ? { projectId } : { project: { workspaceId } },
        select: {
            userId: true,
            projectRole: true,
            user: {
                select: {
                    id: true,
                    surname: true,
                    email: true
                }
            }
        }
    });

    // Normalize to unique members by userId
    const uniqueMembers = new Map<string, NormalMember>();
    projectMembers.forEach(m => {
        if (m.user && !uniqueMembers.has(m.userId)) {
            uniqueMembers.set(m.userId, {
                id: m.userId,
                userId: m.userId,
                projectRole: m.projectRole as ProjectRole,
                user: m.user
            });
        }
    });

    return Array.from(uniqueMembers.values());
}


/**
 * Cached version using Next.js unstable_cache
 */
const getCachedProjectMembers = (params: { projectId?: string; workspaceId?: string }) => {
    const cacheKey = params.projectId
        ? [`project-members-${params.projectId}`]
        : [`workspace-project-members-${params.workspaceId}`];

    const tags = params.projectId
        ? CacheTags.projectMembers(params.projectId)
        : combineTags(CacheTags.workspace(params.workspaceId!), ["project-members"]);

    return unstable_cache(
        async () => _getProjectMembersInternal(params),
        cacheKey,
        {
            tags,
            revalidate: 60,
        }
    )();
};

/**
 * Unified function to get project members
 * Usage: 
 *   getProjectMembers(projectId) 
 *   getProjectMembers({ workspaceId })
 */
export const getProjectMembers = cache(async (arg: string | { workspaceId: string; projectId?: string }) => {
    await requireUser();

    const params = typeof arg === "string" ? { projectId: arg } : arg;

    try {
        return await getCachedProjectMembers(params);
    } catch (error) {
        console.error("Error fetching project members:", error);
        return [];
    }
});

export type ProjectMembersType = Awaited<ReturnType<typeof getProjectMembers>>;
