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

// Internal function that does the actual data fetching
async function _getUserProjectsInternal(userId: string, workspaceId: string) {
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

    // OWNER/ADMIN: See all projects
    if (isOwnerOrAdmin) {
        const allProjects = await prisma.project.findMany({
            where: { workspaceId },
            select: {
                id: true,
                name: true,
                slug: true,
                color: true,
                description: true,
                createdBy: true,
                projectMembers: {
                    select: {
                        id: true,
                        projectRole: true,
                        workspaceMember: {
                            select: {
                                userId: true,
                            },
                        },
                    },
                },
                tasks: {
                    select: {
                        id: true,
                        name: true,
                        taskSlug: true,
                    },
                    orderBy: {
                        createdAt: "desc",
                    },
                },
            },
            orderBy: {
                createdAt: "desc",
            },
        });

        // Add canManageMembers flag for each project
        return allProjects.map(project => {
            const userProjectMember = project.projectMembers.find(
                pm => pm.workspaceMember.userId === userId
            );
            const isProjectManager = userProjectMember?.projectRole === "PROJECT_MANAGER";
            const isCreator = project.createdBy === userId;

            return {
                ...project,
                canManageMembers: isOwnerOrAdmin || isProjectManager || isCreator,
            };
        });
    }

    // MANAGER: See projects they created OR are member of
    if (isManager) {
        const managerProjects = await prisma.project.findMany({
            where: {
                workspaceId,
                OR: [
                    // Projects created by this manager
                    { createdBy: userId },
                    // Projects where they are explicitly added as member
                    {
                        projectMembers: {
                            some: {
                                workspaceMemberId: workspaceMember.id,
                                hasAccess: true,
                            },
                        },
                    },
                ],
            },
            select: {
                id: true,
                name: true,
                slug: true,
                color: true,
                description: true,
                createdBy: true,
                projectMembers: {
                    select: {
                        id: true,
                        projectRole: true,
                        workspaceMember: {
                            select: {
                                userId: true,
                            },
                        },
                    },
                },
                tasks: {
                    select: {
                        id: true,
                        name: true,
                        taskSlug: true,
                    },
                    orderBy: {
                        createdAt: "desc",
                    },
                },
            },
            orderBy: {
                createdAt: "desc",
            },
        });

        // Add canManageMembers flag for each project
        return managerProjects.map(project => {
            const userProjectMember = project.projectMembers.find(
                pm => pm.workspaceMember.userId === userId
            );
            const isProjectManager = userProjectMember?.projectRole === "PROJECT_MANAGER";
            const isCreator = project.createdBy === userId;

            return {
                ...project,
                canManageMembers: isProjectManager || isCreator,
            };
        });
    }

    // MEMBER/VIEWER: Only projects they are member of
    const memberProjects = await prisma.project.findMany({
        where: {
            workspaceId,
            projectMembers: {
                some: {
                    workspaceMemberId: workspaceMember.id,
                    hasAccess: true,
                },
            },
        },
        select: {
            id: true,
            name: true,
            slug: true,
            color: true,
            description: true,
            createdBy: true,
            projectMembers: {
                select: {
                    id: true,
                    projectRole: true,
                    workspaceMember: {
                        select: {
                            userId: true,
                        },
                    },
                },
            },
            tasks: {
                select: {
                    id: true,
                    name: true,
                    taskSlug: true,
                },
                orderBy: {
                    createdAt: "desc",
                },
            },
        },
        orderBy: {
            createdAt: "desc",
        },
    });

    // Add canManageMembers flag for each project
    return memberProjects.map(project => {
        const userProjectMember = project.projectMembers.find(
            pm => pm.workspaceMember.userId === userId
        );
        const isProjectManager = userProjectMember?.projectRole === "PROJECT_MANAGER";
        const isCreator = project.createdBy === userId;

        return {
            ...project,
            canManageMembers: isProjectManager || isCreator,
        };
    });
}

// Cached version with Next.js unstable_cache (persists across requests)
const getCachedUserProjects = (userId: string, workspaceId: string) =>
    unstable_cache(
        async () => _getUserProjectsInternal(userId, workspaceId),
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
