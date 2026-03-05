"use server";

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { notFound } from "next/navigation";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/auth/require-user";
import { CacheTags } from "@/data/cache-tags";

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
        projectRole: "LEAD" | "MEMBER" | "VIEWER" | "PROJECT_MANAGER";
        hasAccess: boolean;
    }>;
    // Client data
    companyName?: string | null;
    registeredCompanyName?: string | null;
    directorName?: string | null;
    address?: string | null;
    gstNumber?: string | null;
    contactPerson?: string | null;
    contactNumber?: string | null;
}

/**
 * Internal function to fetch complete project data
 */
async function _getFullProjectDataInternal(projectId: string, userId: string): Promise<FullProjectData> {
    // 1. Fetch only the core project data and the current user's membership
    const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
            projectMembers: {
                include: {
                    workspaceMember: {
                        include: {
                            user: {
                                select: {
                                    id: true,
                                    // name: true,
                                    surname: true,
                                    // image: true,
                                }
                            }
                        }
                    }
                }
            },
            clint: {
                take: 1, // Only need the primary client
                include: {
                    clintMembers: {
                        take: 1 // Only need the primary contact
                    }
                }
            }
        },
    });

    if (!project) {
        notFound();
    }

    // 2. Efficient access check - look for current user in the project's member list
    const currentUserMember = project.projectMembers.find(
        (pm) => pm.workspaceMember.userId === userId
    );

    // 3. Admin fallback check (if not directly in project, check workspace role)
    if (!currentUserMember) {
        const workspaceMember = await prisma.workspaceMember.findFirst({
            where: {
                workspaceId: project.workspaceId,
                userId: userId,
                workspaceRole: { in: ["ADMIN", "OWNER"] }
            }
        });
        if (!workspaceMember) notFound();
    }

    // Map project members with minimal data
    const projectMembersData = project.projectMembers.map((pm) => ({
        id: pm.id,
        userId: pm.workspaceMember.userId,
        userName: pm.workspaceMember.user?.surname || "Unknown",
        projectRole: pm.projectRole,
        hasAccess: pm.hasAccess,
    }));

    const projectLead = project.projectMembers.find(pm => pm.projectRole === "LEAD");

    return {
        id: project.id,
        name: project.name,
        description: project.description,
        slug: project.slug,
        workspaceId: project.workspaceId,
        projectLead: projectLead?.workspaceMember.userId || null,
        memberAccess: project.projectMembers.map(pm => pm.workspaceMember.userId),
        projectMembers: projectMembersData,
        companyName: project.clint[0]?.name || null,
        registeredCompanyName: project.clint[0]?.registeredCompanyName || null,
        directorName: project.clint[0]?.directorName || null,
        address: project.clint[0]?.address || null,
        gstNumber: project.clint[0]?.gstNumber || null,
        contactPerson: project.clint[0]?.clintMembers[0]?.name || null,
        contactNumber: project.clint[0]?.clintMembers[0]?.contactNumber || null,
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
            tags: CacheTags.fullProject(projectId),
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
