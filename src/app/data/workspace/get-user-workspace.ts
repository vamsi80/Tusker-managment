import prisma from "@/lib/db";
import { requireUser } from "../user/require-user";
import { toast } from "sonner";

export async function getUserWorkspaces() {
    const user = await requireUser();

    const data = await prisma.workspace.findMany({
        where: {
            members: {
                some: {
                    userId: user.id,
                },
            },
        },
        orderBy: {
            createdAt: "desc",
        },
        select: {
            id: true,
            name: true,
            slug: true,
            description: true,
            members: {
                select: {
                    role: true,
                    workspaceId: true,
                    userId: true,
                },
            },
        },
    });
    return data;
}

export type UserWorkspacesType = NonNullable<Awaited<ReturnType<typeof getUserWorkspaces>>>;
