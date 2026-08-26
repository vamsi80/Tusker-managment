import "server-only";
import prisma from "@/lib/db";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";

/**
 * Fetch activity logs for a specific workspace.
 * Only accessible to admins.
 */
export async function getWorkspaceActivity(workspaceId: string) {
    const permissions = await getWorkspacePermissions(workspaceId);

    if (!permissions.isWorkspaceAdmin) {
        throw new Error("Unauthorized: Only admins can view activity logs.");
    }

    return await prisma.auditLog.findMany({
        where: { workspaceId },
        select: {
            id: true,
            action: true,
            entityType: true,
            entityId: true,
            user: {
                select: {
                    name: true,
                    email: true,
                    image: true,
                }
            },
            createdAt: true,
            // Pruning oldData/newData JSON blobs to keep RSC payload small
        },
        orderBy: {
            createdAt: "desc"
        },
        take: 100
    });
}
