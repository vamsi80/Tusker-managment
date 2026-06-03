import type { DbClient } from "./db";

export async function getTaskInvolvedUserIds(db: DbClient, taskId: string): Promise<string[]> {
    try {
        const task = await db.task.findUnique({
            where: { id: taskId },
            select: {
                createdById: true,
                assigneeId: true,
                reviewerId: true,
                projectId: true,
                project: { select: { workspaceId: true } },
                comments: { select: { userId: true }, where: { isDeleted: false } },
            },
        });

        if (!task) return [];

        const involvedUserIds = new Set<string>();
        const workspaceId = task.project.workspaceId;
        const projectId = task.projectId;

        task.comments.forEach(c => involvedUserIds.add(c.userId));

        const workspaceAuthorities = await db.workspaceMember.findMany({
            where: { workspaceId, workspaceRole: { in: ["OWNER", "ADMIN"] } },
            select: { userId: true },
        });
        workspaceAuthorities.forEach(m => involvedUserIds.add(m.userId));

        const projectAuthorities = await db.projectMember.findMany({
            where: { projectId, projectRole: { in: ["PROJECT_MANAGER", "LEAD"] } },
            select: { workspaceMember: { select: { userId: true } } },
        });
        projectAuthorities.forEach(m => {
            if (m.workspaceMember?.userId) involvedUserIds.add(m.workspaceMember.userId);
        });

        const participants = await db.projectMember.findMany({
            where: {
                id: { in: [task.createdById, task.assigneeId, task.reviewerId].filter((id): id is string => !!id) },
            },
            select: { workspaceMember: { select: { userId: true } } },
        });
        participants.forEach(m => {
            if (m.workspaceMember?.userId) involvedUserIds.add(m.workspaceMember.userId);
        });

        return Array.from(involvedUserIds);
    } catch (error) {
        console.error(`[GET_INVOLVED_USERS_ERROR] Failed for task ${taskId}:`, error);
        return [];
    }
}

export async function getWorkspaceAuthorities(db: DbClient, workspaceId: string): Promise<string[]> {
    try {
        const members = await db.workspaceMember.findMany({
            where: { workspaceId, workspaceRole: { in: ["OWNER", "ADMIN"] } },
            select: { userId: true },
        });
        return members.map(m => m.userId);
    } catch (error) {
        console.error(`[GET_WORKSPACE_AUTHORITIES_ERROR] Failed for workspace ${workspaceId}:`, error);
        return [];
    }
}
