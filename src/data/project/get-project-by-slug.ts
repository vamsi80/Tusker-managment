"use server";

import { cache } from "react";
import { unstable_cache } from "next/cache";
import prisma from "@/lib/db";

/**
 * Get a single project by slug or ID
 * Optimized for single project lookup instead of fetching all user projects
 */
export const getProjectBySlug = cache(
    async (workspaceId: string, slug: string) => {
        return unstable_cache(
            async () => {
                return prisma.project.findFirst({
                    where: {
                        workspaceId,
                        OR: [
                            { slug },
                            { id: slug }
                        ]
                    },
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                        workspaceId: true,
                        description: true,
                        createdAt: true,
                        updatedAt: true
                    }
                });
            },
            [`project-${workspaceId}-${slug}`],
            {
                tags: [`project-${slug}`, `workspace-${workspaceId}-projects`],
                revalidate: 60 // 1 minute - projects don't change often
            }
        )();
    }
);

export type ProjectBySlugType = Awaited<ReturnType<typeof getProjectBySlug>>;
