import { getDb } from "@/lib/registry";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";
import { timeQuery } from "@/lib/time-query"; // PERF_TEMP

export async function getBoardData(workspaceId: string, userId: string) {
    const perms = await getWorkspacePermissions(workspaceId, userId);

    if (!perms.hasAccess) {
        return { members: [], isOwner: false, currentMemberId: null };
    }

    const members = await timeQuery("getBoardData", () => getDb().workspaceMember.findMany({ // PERF_TEMP
        where: {
            workspaceId,
            ...(perms.isWorkspaceAdmin ? {} : { userId }),
        },
        include: {
            user: { select: { id: true, name: true, surname: true, image: true, email: true } },
            boardItems: {
                include: {
                    assignedBy: {
                        include: { user: { select: { id: true, name: true, surname: true } } },
                    },
                },
                orderBy: { createdAt: "desc" },
                take: 50,
            },
        },
        orderBy: { user: { name: "asc" } },
    })); // PERF_TEMP

    return { members, isOwner: perms.isWorkspaceAdmin, currentMemberId: perms.workspaceMemberId };
}

export type BoardData = Awaited<ReturnType<typeof getBoardData>>;
