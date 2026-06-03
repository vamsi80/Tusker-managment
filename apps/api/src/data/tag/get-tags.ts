import { getDb } from "@/lib/registry";

export async function getWorkspaceTags(workspaceId: string) {
    try {
        return await getDb().tag.findMany({
            where: { workspaceId },
            select: { id: true, name: true, workspaceId: true, requirePurchase: true },
            orderBy: { name: "asc" },
        });
    } catch (error) {
        console.error("Error fetching workspace tags:", error);
        throw new Error("Failed to fetch workspace tags");
    }
}

export async function getWorkspaceTagsWithCount(workspaceId: string) {
    try {
        return await getDb().tag.findMany({
            where: { workspaceId },
            select: {
                id: true, name: true, workspaceId: true, requirePurchase: true,
                _count: { select: { tasks: true } },
            },
            orderBy: { name: "asc" },
        });
    } catch (error) {
        console.error("Error fetching workspace tags with count:", error);
        throw new Error("Failed to fetch workspace tags with count");
    }
}

export async function getTagById(tagId: string) {
    try {
        return await getDb().tag.findUnique({ where: { id: tagId } });
    } catch (error) {
        console.error("Error fetching tag:", error);
        throw new Error("Failed to fetch tag");
    }
}

export async function tagNameExists(workspaceId: string, name: string, excludeTagId?: string) {
    try {
        const tag = await getDb().tag.findFirst({
            where: {
                workspaceId,
                name: { equals: name, mode: "insensitive" },
                ...(excludeTagId && { id: { not: excludeTagId } }),
            },
        });
        return !!tag;
    } catch (error) {
        console.error("Error checking tag name:", error);
        throw new Error("Failed to check tag name");
    }
}
