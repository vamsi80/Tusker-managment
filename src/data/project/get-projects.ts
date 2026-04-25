"use server";

import { cache } from "react";
import { unstable_cache } from "next/cache";
import prisma from "@/lib/db";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { CacheTags } from "@/data/cache-tags";

/**
 * Project Visibility Rules (STRICT ENFORCEMENT):
 * 
 * OWNER/ADMIN:
 * - Can see ALL projects in the workspace
 * - Automatic visibility, no ProjectMember record needed
 * 
 * MANAGER:
 * - Can see ONLY:
 *   1. Projects they created (createdBy = userId)
 *   2. Projects where they are explicitly added as ProjectMember
 * 
 * MEMBER/VIEWER:
 * - Can see ONLY projects where they are added as ProjectMember
 */

/**
 * Internal function that does the actual data fetching.
 * Exported for use in Hono API routes.
 */
export async function getWorkspaceProjectsForUser(userId: string, workspaceId: string) {
    const workspaceMember = await prisma.workspaceMember.findUnique({
        where: {
            userId_workspaceId: {
                userId,
                workspaceId,
            },
        },
        select: {
            id: true,
            workspaceRole: true,
            userId: true,
        },
    });

    if (!workspaceMember) {
        return null;
    }

    const isOwnerOrAdmin = workspaceMember.workspaceRole === "OWNER" ||
        workspaceMember.workspaceRole === "ADMIN";
    const isManager = workspaceMember.workspaceRole === "MANAGER";

    const projectSelect = {
        id: true,
        name: true,
        slug: true,
        color: true,
        description: true,
        createdBy: true,
        _count: {
            select: {
                projectMembers: true
            }
        },
        projectMembers: {
            select: {
                id: true,
                projectRole: true,
                workspaceMember: {
                    select: { userId: true }
                }
            }
        }
    } as const;


    let projects;

    if (isOwnerOrAdmin) {
        projects = await prisma.project.findMany({
            where: { workspaceId },
            select: projectSelect,
            orderBy: [
                { createdAt: "desc" },
                { id: "desc" },
            ],
        });
    } else if (isManager) {
        projects = await prisma.project.findMany({
            where: {
                workspaceId,
                OR: [
                    { createdBy: userId },
                    {
                        projectMembers: {
                            some: {
                                workspaceMember: { userId: userId },
                                hasAccess: true,
                            },
                        },
                    },
                ],
            },
            select: projectSelect,
            orderBy: [
                { createdAt: "desc" },
                { id: "desc" },
            ],
        });
    } else {
        projects = await prisma.project.findMany({
            where: {
                workspaceId,
                projectMembers: {
                    some: {
                        workspaceMember: { userId: userId },
                        hasAccess: true,
                    },
                },
            },
            select: projectSelect,
            orderBy: [
                { createdAt: "desc" },
                { id: "desc" },
            ],
        });
    }

    return projects.map(project => {
        const userProjectMember = project.projectMembers.find(m => m.workspaceMember.userId === userId);
        const isProjectManager = userProjectMember?.projectRole === "PROJECT_MANAGER";
        const isProjectLead = userProjectMember?.projectRole === "LEAD";
        const isCreator = project.createdBy === userId;

        return {
            id: project.id,
            name: project.name,
            slug: project.slug,
            color: project.color,
            canManageMembers: isOwnerOrAdmin || isProjectManager || isCreator,
        };
    });
}

/**
 * Lightweight version for sidebar/layout.
 * Returns only id, name, slug, color.
 */
export async function getMinimalWorkspaceProjectsForUser(userId: string, workspaceId: string) {
    const workspaceMember = await prisma.workspaceMember.findUnique({
        where: {
            userId_workspaceId: {
                userId,
                workspaceId,
            },
        },
        select: {
            id: true,
            workspaceRole: true,
        },
    });

    if (!workspaceMember) return [];

    const isOwnerOrAdmin = workspaceMember.workspaceRole === "OWNER" || workspaceMember.workspaceRole === "ADMIN";
    
    const where: any = { workspaceId };
    
    if (!isOwnerOrAdmin) {
        where.OR = [
            { createdBy: userId },
            {
                projectMembers: {
                    some: {
                        workspaceMember: { userId },
                        hasAccess: true,
                    },
                },
            },
        ];
    }

    return prisma.project.findMany({
        where,
        select: {
            id: true,
            name: true,
            slug: true,
            color: true,
        },
        orderBy: [
            { createdAt: "desc" },
            { id: "desc" },
        ],
    });
}

export type MinimalProjectData = Awaited<ReturnType<typeof getMinimalWorkspaceProjectsForUser>>[number];


// Cached version with Next.js unstable_cache (persists across requests)
const getCachedUserProjects = (userId: string, workspaceId: string) =>
    unstable_cache(
        async () => getWorkspaceProjectsForUser(userId, workspaceId),
        [`user-projects-${userId}-${workspaceId}`],
        {
            tags: CacheTags.userProjects(userId, workspaceId),
            revalidate: 60,
        }
    )();


// React cache wrapper (deduplicates requests within the same render)
export const getUserProjects = cache(async (workspaceId: string) => {
    const user = await requireUser();
    const projects = await getCachedUserProjects(user.id, workspaceId);

    if (!projects) {
        return notFound();
    }

    return projects;
});

export type UserProjectsType = Awaited<ReturnType<typeof getUserProjects>>;
