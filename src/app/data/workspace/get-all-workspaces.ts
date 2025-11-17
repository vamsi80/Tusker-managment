import "server-only";

import prisma from "@/lib/db";

export async function getAllWorkspaces() {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const data = await prisma.workspace.findMany({

        orderBy: {
            createdAt: "desc",
        },

        select: {
            id: true,
            name: true,
            description: true,
            slug: true,
        },
    });
    return data;
}

export type MainWorkspaceType = Awaited<ReturnType<typeof getAllWorkspaces>>[0];
