import { getDb } from "@/lib/registry";

/**
 * Resolves a target user's ProjectMember.id within a project.
 * Useful when assigning a task to another user.
 */
export async function resolveProjectMemberId(
    targetUserId: string,
    projectId: string,
    workspaceId: string
): Promise<string | null> {
    const pm = await getDb().projectMember.findFirst({
        where: {
            projectId,
            workspaceMember: {
                userId: targetUserId,
                workspaceId,
            },
        },
        select: { id: true },
    });
    return pm?.id ?? null;
}

/**
 * Batch-resolves multiple User.id values to their ProjectMember.id values
 * for a given project. Returns a Map<userId, projectMemberId>.
 */
export async function resolveProjectMemberIds(
    userIds: string[],
    projectId: string,
    workspaceId: string
): Promise<Map<string, string>> {
    const unique = [...new Set(userIds.filter(Boolean))];
    if (unique.length === 0) return new Map();

    const members = await getDb().projectMember.findMany({
        where: {
            projectId,
            workspaceMember: {
                userId: { in: unique },
                workspaceId,
            },
        },
        select: {
            id: true,
            workspaceMember: {
                select: { userId: true },
            },
        },
    });

    return new Map(members.map(m => [m.workspaceMember.userId, m.id]));
}
