import { Hono } from "hono";
import { HonoVariables } from "../types";
import { getWorkspaceTags, getWorkspaceTagsWithCount, tagNameExists } from "@/data/tag/get-tags";
import { AppError } from "@/lib/errors/app-error";
import { ProjectService } from "@/server/services/project/project.service";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";
import { getDb } from "@/lib/registry";
import { z } from "zod";

const tags = new Hono<{ Variables: HonoVariables }>();

const createTagSchema = z.object({
    name: z.string().min(1).max(50),
    requirePurchase: z.boolean().default(false),
    workspaceId: z.string(),
    projectId: z.string().optional(),
});

const updateTagSchema = z.object({
    tagId: z.string(),
    workspaceId: z.string(),
    name: z.string().min(1).max(50).optional(),
    requirePurchase: z.boolean().optional(),
});

tags.get("/", async (c) => {
    const workspaceId = c.req.query("workspaceId");
    const projectId = c.req.query("projectId");
    const withCount = c.req.query("withCount") === "true";
    if (!workspaceId) throw AppError.ValidationError("Missing workspaceId");

    if (projectId) {
        const result = await ProjectService.getProjectTags(projectId);
        return c.json({ success: true, tags: result });
    }

    if (withCount) {
        const result = await getWorkspaceTagsWithCount(workspaceId);
        return c.json({ success: true, tags: result });
    }

    const result = await getWorkspaceTags(workspaceId);
    return c.json({ success: true, tags: result });
});

tags.post("/", async (c) => {
    const user = c.get("user");
    const body = await c.req.json();
    const parsed = createTagSchema.safeParse(body);
    if (!parsed.success) throw AppError.ValidationError("Invalid tag data");

    const { workspaceId, name, requirePurchase, projectId } = parsed.data;
    const perms = await getWorkspacePermissions(workspaceId, user.id);
    if (!perms.isWorkspaceAdmin) throw AppError.Forbidden("Only admins can create tags");

    const exists = await tagNameExists(workspaceId, name);
    if (exists) throw AppError.Conflict("Tag with this name already exists");

    const tag = await getDb().tag.create({
        data: { name, requirePurchase, workspaceId },
    });

    return c.json({ success: true, data: tag });
});

tags.patch("/", async (c) => {
    const user = c.get("user");
    const body = await c.req.json();
    const parsed = updateTagSchema.safeParse(body);
    if (!parsed.success) throw AppError.ValidationError("Invalid tag data");

    const { tagId, workspaceId, name, requirePurchase } = parsed.data;
    const perms = await getWorkspacePermissions(workspaceId, user.id);
    if (!perms.isWorkspaceAdmin) throw AppError.Forbidden("Only admins can update tags");

    if (name) {
        const exists = await tagNameExists(workspaceId, name, tagId);
        if (exists) throw AppError.Conflict("Tag with this name already exists");
    }

    const tag = await getDb().tag.update({
        where: { id: tagId },
        data: { ...(name !== undefined && { name }), ...(requirePurchase !== undefined && { requirePurchase }) },
    });

    return c.json({ success: true, data: tag });
});

tags.delete("/", async (c) => {
    const user = c.get("user");
    const tagId = c.req.query("tagId");
    const workspaceId = c.req.query("workspaceId");
    if (!tagId || !workspaceId) throw AppError.ValidationError("Missing tagId or workspaceId");

    const perms = await getWorkspacePermissions(workspaceId, user.id);
    if (!perms.isWorkspaceAdmin) throw AppError.Forbidden("Only admins can delete tags");

    await getDb().tag.delete({ where: { id: tagId } });

    return c.json({ success: true, message: "Tag deleted successfully" });
});

export default tags;
