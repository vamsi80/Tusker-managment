import prisma from "@/lib/db";
import { requireUser } from "../user/require-user";
import { toast } from "sonner";
import { notFound } from "next/navigation";

export async function getWorkspacesProjectsByWorkspaceId(workspaceId: string) {
    const user = await requireUser();

    const isUserMember = await prisma.workspaceMember.findUnique({
        where: {
            userId_workspaceId: {
                userId: user.id,
                workspaceId,
            },
        },
    });

    if (!isUserMember) {
        toast.error("You are not a member of this workspace");
        return notFound();
    }

    const [workspaceMembers , projects] = await Promise.all([
        prisma.workspaceMember.findMany({
            where: {
                workspaceId,
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        image: true,
                    },
                },
                projectAccess: {
                    select: {
                        id: true,
                        projectId: true,
                        hasAccess: true,
                    },
                },
            }
        }),
        prisma.project.findMany({
            where: {
                workspaceId,
            },
            select: {
                id: true,
                name: true,
            }
        }),
    ])

    return {
        workspaceMembers,
        projects
    };
}

export type WorkspaceProjectsType = NonNullable<Awaited<ReturnType<typeof getWorkspacesProjectsByWorkspaceId>>>;
export type WorkspaceMemberType = WorkspaceProjectsType["workspaceMembers"][number];
