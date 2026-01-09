"use server";

import { cache } from "react";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/auth/require-user";

export const getProcurableProjects = cache(async (workspaceId: string) => {
    const user = await requireUser();

    // Get workspace member info
    const workspaceMember = await prisma.workspaceMember.findUnique({
        where: {
            userId_workspaceId: {
                userId: user.id,
                workspaceId,
            },
        },
        select: {
            id: true,
            workspaceRole: true,
        },
    });

    if (!workspaceMember) {
        return [];
    }

    // If Admin/Owner, return all projects in workspace
    if (workspaceMember.workspaceRole === "OWNER" || workspaceMember.workspaceRole === "ADMIN") {
        return await prisma.project.findMany({
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
    }

    // If Member, return only projects where they are LEAD
    const procurableProjects = await prisma.project.findMany({
        where: {
            workspaceId,
            projectMembers: {
                some: {
                    workspaceMemberId: workspaceMember.id,
                    projectRole: "LEAD",
                },
            },
        },
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

    return procurableProjects;
});
