import prisma from "@/lib/db";

// ============================================================
//  BATCH LOADER: Users
//  Instead of a JOIN on every task, collect unique IDs and
//  fire a single IN() query.  O(1) lookup via Map.
// ============================================================
export async function batchLoadUsers(ids: (string | null | undefined)[]) {
    const unique = [...new Set(ids.filter(Boolean))] as string[];
    if (unique.length === 0) return new Map<string, any>();

    const users = await prisma.user.findMany({
        where: { id: { in: unique } },
        select: { id: true, name: true, surname: true, image: true, email: true },
    });

    return new Map(users.map(u => [u.id, u]));
}

// ============================================================
//  BATCH LOADER: Tags
// ============================================================
export async function batchLoadTags(ids: (string | null | undefined)[]) {
    const unique = [...new Set(ids.filter(Boolean))] as string[];
    if (unique.length === 0) return new Map<string, any>();

    const tags = await prisma.tag.findMany({
        where: { id: { in: unique } },
        select: { id: true, name: true },
    });

    return new Map(tags.map(t => [t.id, t]));
}

// ============================================================
//  BATCH LOADER: Projects (lean — no member joins)
// ============================================================
export async function batchLoadProjects(ids: (string | null | undefined)[]) {
    const unique = [...new Set(ids.filter(Boolean))] as string[];
    if (unique.length === 0) return new Map<string, any>();

    const projects = await prisma.project.findMany({
        where: { id: { in: unique } },
        select: {
            id: true,
            name: true,
            slug: true,
            color: true,
            workspaceId: true,
            projectMembers: {
                where: { projectRole: { in: ["PROJECT_MANAGER", "LEAD"] }, hasAccess: true }, // Use correct enum values from schema
                take: 1,
                select: {
                    workspaceMember: {
                        select: {
                            user: {
                                select: {
                                    name: true,
                                    surname: true,
                                    image: true
                                }
                            }
                        }
                    }
                }
            }
        },
    });

    return new Map(projects.map(p => [p.id, p]));
}

// ============================================================
//  HYDRATOR: Attach batch-loaded entities to raw tasks
// ============================================================
export function hydrateTasks<T extends {
    id: string;
    assigneeTo: string | null;
    reviewerId: string | null;
    createdById: string;
    tagId: string | null;
    projectId: string;
}>(
    rawTasks: T[],
    userMap: Map<string, any>,
    tagMap: Map<string, any>,
    projectMap: Map<string, any>
) {
    return rawTasks.map(task => ({
        ...task,
        assignee: task.assigneeTo ? userMap.get(task.assigneeTo) ?? null : null,
        reviewer: task.reviewerId ? userMap.get(task.reviewerId) ?? null : null,
        createdBy: userMap.get(task.createdById) ?? null,
        tag: task.tagId ? tagMap.get(task.tagId) ?? null : null,
        project: projectMap.get(task.projectId) ?? null,
    }));
}
