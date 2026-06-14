import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { HonoVariables } from "../types";
import { AppError } from "@tusker/shared/errors";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";
import { getDb } from "@/lib/registry";
import { CreateMaterialItemSchema, UpdateMaterialItemSchema } from "@/hono/schemas";

const projectMaterials = new Hono<{ Variables: HonoVariables }>();

/**
 * GET /api/v1/projects/:projectId/materials
 * List planning tasks and material items in a project (paginated)
 */
projectMaterials.get("/:projectId/materials", async (c) => {
  const user = c.get("user");
  const projectId = c.req.param("projectId");
  const workspaceId = c.req.query("w");
  const page = Math.max(1, parseInt(c.req.query("page") || "1"));
  const limit = Math.min(100, parseInt(c.req.query("limit") || "50"));
  const skip = (page - 1) * limit;

  if (!workspaceId) throw AppError.ValidationError("Missing workspaceId (w)");

  const perms = await getWorkspacePermissions(workspaceId, user.id);
  if (!perms.hasAccess) {
    throw AppError.Forbidden("Access denied to this workspace");
  }

  const subtaskWhere = {
    projectId,
    isParent: false,
    tags: {
      some: {
        OR: [
          { requirePurchase: true },
          { name: { equals: "procurement", mode: "insensitive" as const } },
        ],
      },
    },
  };

  const [subtasks, materialItems, materialTotal] = await Promise.all([
    getDb().task.findMany({
      where: subtaskWhere,
      include: {
        parentTask: { select: { id: true, name: true, taskSlug: true } },
        tags: { select: { id: true, name: true, requirePurchase: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    getDb().projectMaterialItem.findMany({
      where: { projectId },
      include: {
        addedBy: {
          include: {
            user: { select: { name: true, surname: true } },
          },
        },
        subtask: {
          select: {
            name: true,
            parentTask: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip,
    }),
    getDb().projectMaterialItem.count({ where: { projectId } }),
  ]);

  return c.json({
    success: true,
    data: {
      subtasks,
      materialItems,
    },
    meta: { page, limit, total: materialTotal },
  });
});

/**
 * POST /api/v1/projects/:projectId/materials
 * Add a material item to the planning list
 */
projectMaterials.post("/:projectId/materials", zValidator("json", CreateMaterialItemSchema), async (c) => {
  const user = c.get("user");
  const projectId = c.req.param("projectId");
  const workspaceId = c.req.query("w");
  const body = c.req.valid("json");

  if (!workspaceId) throw AppError.ValidationError("Missing workspaceId (w)");

  const perms = await getWorkspacePermissions(workspaceId, user.id);
  if (!perms.hasAccess) {
    throw AppError.Forbidden("Access denied to this workspace");
  }

  // Find workspace member id for this user
  const member = await getDb().workspaceMember.findFirst({
    where: { userId: user.id, workspaceId },
    select: { id: true },
  });

  if (!member) throw AppError.NotFound("Workspace member profile not found");

  const newItem = await getDb().projectMaterialItem.create({
    data: {
      projectId,
      subtaskId: body.subtaskId || null,
      materialName: body.materialName.trim(),
      unit: body.unit.toUpperCase().trim(),
      quantity: body.quantity,
      notes: body.notes || null,
      addedById: member.id,
    },
    include: {
      addedBy: {
        include: {
          user: { select: { name: true, surname: true } },
        },
      },
    },
  });

  return c.json({ success: true, data: newItem }, 201);
});

/**
 * PATCH /api/v1/projects/:projectId/materials/:itemId
 * Edit a material item
 */
projectMaterials.patch("/:projectId/materials/:itemId", zValidator("json", UpdateMaterialItemSchema), async (c) => {
  const user = c.get("user");
  const projectId = c.req.param("projectId");
  const itemId = c.req.param("itemId");
  const workspaceId = c.req.query("w");
  const body = c.req.valid("json");

  if (!workspaceId) throw AppError.ValidationError("Missing workspaceId (w)");

  const perms = await getWorkspacePermissions(workspaceId, user.id);
  if (!perms.hasAccess) {
    throw AppError.Forbidden("Access denied to this workspace");
  }

  // Check if item exists
  const existing = await getDb().projectMaterialItem.findFirst({
    where: { id: itemId, projectId },
  });

  if (!existing) throw AppError.NotFound("Material item not found");

  const updated = await getDb().projectMaterialItem.update({
    where: { id: itemId },
    data: {
      subtaskId: body.subtaskId !== undefined ? body.subtaskId : undefined,
      materialName: body.materialName !== undefined ? body.materialName.trim() : undefined,
      unit: body.unit !== undefined ? body.unit.toUpperCase().trim() : undefined,
      quantity: body.quantity !== undefined ? body.quantity : undefined,
      notes: body.notes !== undefined ? body.notes : undefined,
    },
    include: {
      addedBy: {
        include: {
          user: { select: { name: true, surname: true } },
        },
      },
    },
  });

  return c.json({ success: true, data: updated });
});

/**
 * DELETE /api/v1/projects/:projectId/materials/:itemId
 * Delete a material item
 */
projectMaterials.delete("/:projectId/materials/:itemId", async (c) => {
  const user = c.get("user");
  const projectId = c.req.param("projectId");
  const itemId = c.req.param("itemId");
  const workspaceId = c.req.query("w");

  if (!workspaceId) throw AppError.ValidationError("Missing workspaceId (w)");

  const perms = await getWorkspacePermissions(workspaceId, user.id);
  if (!perms.hasAccess) {
    throw AppError.Forbidden("Access denied to this workspace");
  }

  // Check if item exists
  const existing = await getDb().projectMaterialItem.findFirst({
    where: { id: itemId, projectId },
  });

  if (!existing) throw AppError.NotFound("Material item not found");

  await getDb().projectMaterialItem.delete({
    where: { id: itemId },
  });

  return c.json({ success: true, message: "Material item deleted successfully" });
});

export default projectMaterials;
