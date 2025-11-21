import prisma from "@/lib/db";
import { requireUser } from "../user/require-user";
import { toast } from "sonner";
import { notFound } from "next/navigation";

export async function getUserWorkspaces() {
    const user = await requireUser();

    const data = await prisma.user.findUnique({
        where: {
            id: user.id,
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
