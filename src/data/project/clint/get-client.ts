"use server";

import { cache } from "react";
import { unstable_cache } from "next/cache";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/auth/require-user";

/**
 * Client data type
 */
export interface ProjectClientData {
    companyName: string | null;
    registeredCompanyName: string | null;
    directorName: string | null;
    address: string | null;
    gstNumber: string | null;
    contactPerson: string | null;
    contactNumber: string | null;
}

/**
 * Internal function to fetch project client data
 */
async function _getProjectClientInternal(projectId: string): Promise<ProjectClientData | null> {
    try {
        const project = await prisma.project.findUnique({
            where: { id: projectId },
            select: {
                clint: {
                    include: {
                        clintMembers: true,
                    },
                },
            },
        });

        if (!project || !project.clint || project.clint.length === 0) {
            return null;
        }

        // Get client data (first client if exists)
        const clientRecord = project.clint[0];
        const clientMember = clientRecord?.clintMembers?.[0];

        return {
            companyName: clientRecord?.name || null,
            registeredCompanyName: clientRecord?.registeredCompanyName || null,
            directorName: clientRecord?.directorName || null,
            address: clientRecord?.address || null,
            gstNumber: clientRecord?.gstNumber || null,
            contactPerson: clientMember?.name || null,
            contactNumber: clientMember?.contactNumber || null,
        };
    } catch (error) {
        console.error("Error fetching project client data:", error);
        return null;
    }
}

/**
 * Cached version using Next.js unstable_cache
 */
const getCachedProjectClient = (projectId: string) =>
    unstable_cache(
        async () => _getProjectClientInternal(projectId),
        [`project-client-${projectId}`],
        {
            tags: [`project-client-${projectId}`, `project-${projectId}`],
            revalidate: 60 // 1 minute - client data doesn't change often
        }
    )();

/**
 * Fetch project client data
 * 
 * Behavior:
 * - Validates user authentication
 * - Fetches client information for a project (cached)
 * - Returns null if no client data exists
 * 
 * Caching Strategy:
 * 1. React cache() - Deduplicates requests within the same render
 * 2. unstable_cache() - Persists data across requests for 1 minute
 * 
 * Cache Invalidation:
 * - Use revalidateTag(`project-client-${projectId}`) to invalidate specific project client
 * - Use revalidateTag(`project-${projectId}`) to invalidate all project data
 * 
 * @param projectId - The project ID
 * @returns Client data or null if not found
 * 
 * @example
 * const clientData = await getProjectClient(projectId);
 * if (clientData) {
 *   console.log(clientData.companyName);
 *   console.log(clientData.contactPerson);
 * }
 */
export const getProjectClient = cache(async (projectId: string): Promise<ProjectClientData | null> => {
    await requireUser();

    try {
        return await getCachedProjectClient(projectId);
    } catch (error) {
        console.error("Error in getProjectClient:", error);
        return null;
    }
});

export type ProjectClientType = Awaited<ReturnType<typeof getProjectClient>>;
