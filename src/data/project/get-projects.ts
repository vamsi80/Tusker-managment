"use server";

import { cache } from "react";
import { unstable_cache } from "next/cache";
import prisma from "@/lib/db";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { CacheTags } from "@/data/cache-tags";

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
            projectMembers: {
                select: {
                    project: {
                        select: {
                            id: true,
                            name: true,
                            slug: true,
                            description: true,
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
                    },
                },
            },
        },
    });

    if (!workspaceMember) {
        return null;
    }

    // If user is admin or owner, get all projects in the workspace
    if (workspaceMember.workspaceRole === "OWNER" || workspaceMember.workspaceRole === "ADMIN") {
        const allProjects = await prisma.project.findMany({
            where: { workspaceId },
            select: {
                id: true,
                name: true,
                slug: true,
                description: true,
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
        return allProjects;
    }

    // Otherwise, return only projects they have access to
    return workspaceMember.projectMembers.map((access) => access.project);
}

// Cached version with Next.js unstable_cache (persists across requests)
const getCachedUserProjects = (userId: string, workspaceId: string) =>
    unstable_cache(
        async () => _getUserProjectsInternal(userId, workspaceId),
        [`user-projects-${userId}-${workspaceId}`],
        {
            tags: CacheTags.userProjects(userId, workspaceId),
            revalidate: 60, // Disable cache for now to reflect DB changes immediately
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
