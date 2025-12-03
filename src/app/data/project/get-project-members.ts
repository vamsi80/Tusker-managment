"use server";

import prisma from "@/lib/db";
import { requireUser } from "@/app/data/user/require-user";

export async function getProjectMembers(projectId: string) {
    const user = await requireUser();

    try {
        // Only fetch project members (workspace admins are excluded unless they're also project members)
        const members = await prisma.projectMember.findMany({
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

        return members;
    } catch (error) {
        console.error("Error fetching project members:", error);
        return [];
    }
}

export type ProjectMembersType = Awaited<ReturnType<typeof getProjectMembers>>;
