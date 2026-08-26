import { z } from "zod";
import prisma from "@tusker/db";
import { invalidateWorkspaceTags } from "../../../lib/cache/invalidation";
import { fetchWorkspacePermissions } from "../../../permissions";

/**
 * Workspace tag management.
 *
 * The caller supplies the acting user; this service never resolves a session,
 * so it works identically for a cookie-authenticated web request and a
 * bearer-token API request.
 */

export const createTagSchema = z.object({
    name: z.string().min(1, "Tag name is required").max(50, "Tag name must be less than 50 characters"),
    requirePurchase: z.boolean().default(false),
    workspaceId: z.string(),
    projectId: z.string().optional(),
});

export const updateTagSchema = z.object({
    tagId: z.string(),
    name: z.string().min(1, "Tag name is required").max(50, "Tag name must be less than 50 characters"),
    requirePurchase: z.boolean().default(false),
    workspaceId: z.string(),
});

export const deleteTagSchema = z.object({
    tagId: z.string(),
    workspaceId: z.string(),
});

export type TagResult<T = undefined> =
    | { success: true; data?: T }
    | { success: false; error: string };

function failure(error: unknown, fallback: string): { success: false; error: string } {
    if (error instanceof z.ZodError) {
        return { success: false, error: error.issues[0].message };
    }
    console.error(fallback, error);
    return { success: false, error: fallback };
}

async function requireWorkspaceAdmin(workspaceId: string, userId: string, action: string) {
    const permissions = await fetchWorkspacePermissions(workspaceId, userId);
    if (!permissions.isWorkspaceAdmin) {
        return `You don't have permission to ${action} tags`;
    }
    return null;
}

export class TagService {
    /** All tags in a workspace, alphabetically. */
    static async listWorkspaceTags(workspaceId: string) {
        return prisma.tag.findMany({
            where: { workspaceId },
            select: { id: true, name: true, workspaceId: true, requirePurchase: true },
            orderBy: { name: "asc" },
        });
    }

    /** All tags in a workspace, with how many tasks use each. */
    static async listWorkspaceTagsWithCount(workspaceId: string) {
        return prisma.tag.findMany({
            where: { workspaceId },
            select: {
                id: true,
                name: true,
                workspaceId: true,
                requirePurchase: true,
                _count: { select: { tasks: true } },
            },
            orderBy: { name: "asc" },
        });
    }

    static async getTagById(tagId: string) {
        return prisma.tag.findUnique({ where: { id: tagId } });
    }

    /** Case-insensitive name check, optionally ignoring one tag (for renames). */
    static async nameExists(workspaceId: string, name: string, excludeTagId?: string) {
        const tag = await prisma.tag.findFirst({
            where: {
                workspaceId,
                name: { equals: name, mode: "insensitive" },
                ...(excludeTagId && { id: { not: excludeTagId } }),
            },
        });
        return !!tag;
    }

    static async createTag(userId: string, data: z.input<typeof createTagSchema>) {
        try {
            const values = createTagSchema.parse(data);

            const denied = await requireWorkspaceAdmin(values.workspaceId, userId, "create");
            if (denied) return { success: false as const, error: denied };

            const exists = await prisma.tag.findFirst({
                where: {
                    workspaceId: values.workspaceId,
                    name: { equals: values.name, mode: "insensitive" },
                },
            });

            if (exists) {
                // An existing workspace tag is reused rather than duplicated when
                // it is being added to a project.
                if (values.projectId) {
                    await prisma.project.update({
                        where: { id: values.projectId },
                        data: { tags: { connect: { id: exists.id } } },
                    });
                    await invalidateWorkspaceTags(values.workspaceId);
                    return { success: true as const, data: exists };
                }
                return { success: false as const, error: "A tag with this name already exists" };
            }

            const tag = await prisma.tag.create({
                data: {
                    name: values.name,
                    requirePurchase: values.requirePurchase,
                    workspaceId: values.workspaceId,
                    ...(values.projectId ? { projects: { connect: { id: values.projectId } } } : {}),
                },
            });

            await invalidateWorkspaceTags(values.workspaceId);
            return { success: true as const, data: tag };
        } catch (error) {
            return failure(error, "Failed to create tag");
        }
    }

    static async updateTag(userId: string, data: z.input<typeof updateTagSchema>) {
        try {
            const values = updateTagSchema.parse(data);

            const denied = await requireWorkspaceAdmin(values.workspaceId, userId, "update");
            if (denied) return { success: false as const, error: denied };

            if (await TagService.nameExists(values.workspaceId, values.name, values.tagId)) {
                return { success: false as const, error: "A tag with this name already exists" };
            }

            const tag = await prisma.tag.update({
                where: { id: values.tagId },
                data: { name: values.name, requirePurchase: values.requirePurchase },
            });

            await invalidateWorkspaceTags(values.workspaceId);
            return { success: true as const, data: tag };
        } catch (error) {
            return failure(error, "Failed to update tag");
        }
    }

    static async deleteTag(userId: string, data: z.input<typeof deleteTagSchema>) {
        try {
            const values = deleteTagSchema.parse(data);

            const denied = await requireWorkspaceAdmin(values.workspaceId, userId, "delete");
            if (denied) return { success: false as const, error: denied };

            await prisma.tag.delete({ where: { id: values.tagId } });
            await invalidateWorkspaceTags(values.workspaceId);
            return { success: true as const };
        } catch (error) {
            return failure(error, "Failed to delete tag");
        }
    }
}
