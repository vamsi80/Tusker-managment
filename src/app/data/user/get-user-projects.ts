"use server";

import { cache } from "react";
import { unstable_cache } from "next/cache";
import prisma from "@/lib/db";
import { requireUser } from "./require-user";
import { notFound } from "next/navigation";

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
            projectAccess: {
                select: {
                    project: {
                        select: {
                            id: true,
                            name: true,
                            slug: true,
                            description: true,
                        },
                    },
                },
            },
        },
    });

    if (!workspaceMember) {
        return null;
    }

    // If user is admin, get all projects in the workspace
    if (workspaceMember.workspaceRole === "ADMIN") {
        const allProjects = await prisma.project.findMany({
            where: { workspaceId },
            select: {
                id: true,
                name: true,
                slug: true,
                description: true,
            },
            orderBy: {
                createdAt: "desc",
            },
        });
        return allProjects;
    }

    // Otherwise, return only projects they have access to
    return workspaceMember.projectAccess.map((access) => access.project);
}

// Cached version with Next.js unstable_cache (persists across requests)
const getCachedUserProjects = (userId: string, workspaceId: string) =>
    unstable_cache(
        async () => _getUserProjectsInternal(userId, workspaceId),
        [`user-projects-${userId}-${workspaceId}`],
        {
            tags: [`user-projects-${userId}`, `workspace-projects-${workspaceId}`],
            revalidate: 60 * 60 * 24, // Revalidate every 24 hours
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
