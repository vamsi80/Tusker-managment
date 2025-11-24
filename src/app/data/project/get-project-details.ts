import prisma from "@/lib/db";
import { requireUser } from "../user/require-user"

export const getProjectDetails = async (projectId: string, workspaceId: string) => {
    try {
        const user = await requireUser()
        if (!user) {
            return {
                success: false,
                error: true,
                message: "User not authenticated",
            };
        }

        const [isUserMember, totalWorkspaceMembers] = await Promise.all([
            prisma.workspaceMember.findUnique({
                where: {
                    userId_workspaceId: {
                        userId: user.id,
                        workspaceId,
                    },
                },
            }),
            prisma.workspaceMember.count({
                where: { workspaceId },
            }),
        ]);

    } catch (error) {

    }
}