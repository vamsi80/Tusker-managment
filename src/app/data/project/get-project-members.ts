"use server";

import { cache } from "react";
import { unstable_cache } from "next/cache";
import prisma from "@/lib/db";
import { requireUser } from "@/app/data/user/require-user";

/**
 * Internal function to fetch project members
 */
async function _getProjectMembersInternal(projectId: string) {
    return prisma.projectMember.findMany({
        where: {
            projectId: projectId,
        },
        include: {
            workspaceMember: {
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            surname: true,
                            image: true,
                            email: true,
                        },
                    },
                },
            },
        },
    });
}

/**
 * Cached version using Next.js unstable_cache
 * - Persists across requests for 5 minutes
 * - Tagged for targeted invalidation
 */
const getCachedProjectMembers = (projectId: string) =>
    unstable_cache(
        async () => _getProjectMembersInternal(projectId),
        [`project-members-${projectId}`],
        {
            tags: [`project-members-${projectId}`],
            revalidate: 60, // Cache for 60 seconds
        }
    )();

/**
 * Get project members with multi-layer caching
 * 
 * Caching Strategy:
 * 1. React cache() - Deduplicates identical requests within the same render
 * 2. unstable_cache() - Persists data across requests for 5 minutes
 * 
 * Cache Invalidation:
 * - Use revalidateTag(`project-members-${projectId}`) to invalidate
 */
export const getProjectMembers = cache(async (projectId: string) => {
    await requireUser();

    try {
        return await getCachedProjectMembers(projectId);
    } catch (error) {
        console.error("Error fetching project members:", error);
        return [];
    }
});

export type ProjectMembersType = Awaited<ReturnType<typeof getProjectMembers>>;
