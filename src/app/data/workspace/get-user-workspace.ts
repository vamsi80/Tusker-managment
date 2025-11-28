import prisma from "@/lib/db";
import { requireUser } from "../user/require-user";
import { notFound } from "next/navigation";

export async function getUserWorkspaces() {
    const session = await requireUser();
    const data = await prisma.user.findUnique({
        where: {
            id: session.id,
        },
        include: {
            workspaces: {
                select: {
                    id: true,
                    userId: true,
                    workspaceId: true,
                    accessLevel: true,
                    workspace: {
                        select: {
                            name: true,
                            slug: true,
                        }
                    }
                }
            }

        }
    });

    if (!data) {
        return notFound();
    }
    return data;
}

export type UserWorkspacesType = NonNullable<Awaited<ReturnType<typeof getUserWorkspaces>>>;
