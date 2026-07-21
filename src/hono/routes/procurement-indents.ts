import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { HonoVariables } from "../types";
import { AppError } from "@/lib/errors/app-error";
import { VendorRepository, IndentService, IndentRepository } from "@/server/services/procurement";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";
import prisma from "@/lib/db";

const procurementIndents = new Hono<{ Variables: HonoVariables }>();

const parseMultiQuery = (value?: string): string[] => {
  if (!value || value === "ALL") return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    return parsed ? [String(parsed)] : [];
  } catch {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
};

// Zod validation schemas
const CreateIndentSchema = z.object({
  taskId: z.string().optional().nullable(),
  projectId: z.string(),
  workspaceId: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  expectedDelivery: z.string().optional(),
  lineItems: z.array(
    z.object({
      materialName: z.string().min(1),
      unit: z.string().min(1),
      quantity: z.number().int().positive(),
      estimatedUnitPrice: z.number().int().positive().optional(),
      specifications: z.string().nullable().optional(),
    })
  ).optional(),
});

const AddLineItemSchema = z.object({
  materialName: z.string().min(1),
  unit: z.string().min(1),
  quantity: z.number().int().positive(),
  estimatedUnitPrice: z.number().int().positive().optional(),
  specifications: z.string().nullable().optional(),
});

const UpdateLineItemSchema = z.object({
  materialName: z.string().min(1).optional(),
  unit: z.string().min(1).optional(),
  quantity: z.number().int().positive().optional(),
  estimatedUnitPrice: z.number().int().positive().optional(),
  specifications: z.string().nullable().optional(),
});

const CancelIndentSchema = z.object({
  reason: z.string().min(1),
});

const AssignIndentSchema = z.object({
  assigneeId: z.string(),
});

/**
 * GET /api/v1/procurement/indents/units
 * List all active units of measure in a workspace
 */
procurementIndents.get("/units", async (c) => {
  const user = c.get("user");
  const workspaceId = c.req.query("w");

  if (!workspaceId) throw AppError.ValidationError("Missing workspaceId (w)");

  const perms = await getWorkspacePermissions(workspaceId, user.id);
  if (!perms.hasAccess) {
    throw AppError.Forbidden("Access denied to this workspace");
  }

  const units = await prisma.unitOfMeasure.findMany({
    where: { workspaceId },
    orderBy: [
      { isDefault: "desc" },
      { abbreviation: "asc" }
    ]
  });

  return c.json({ success: true, data: units });
});

/**
 * GET /api/v1/procurement/indents
 * List all indents in workspace
 */
procurementIndents.get("/", async (c) => {
  const user = c.get("user");
  const workspaceId = c.req.query("w");

  if (!workspaceId) throw AppError.ValidationError("Missing workspaceId (w)");

  const perms = await getWorkspacePermissions(workspaceId, user.id);
  if (!perms.hasAccess) {
    throw AppError.Forbidden("Access denied to this workspace");
  }

  const indents = await prisma.indent.findMany({
    where: { workspaceId },
    include: {
      project: { select: { id: true, name: true, slug: true } },
      requestedBy: { select: { user: { select: { name: true, surname: true } } } },
      task: { select: { name: true } },
      _count: { select: { lineItems: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return c.json({ success: true, data: indents });
});

/**
 * GET /api/v1/procurement/indents/task/:taskId
 * Fetch indent details by taskId if one exists
 */
procurementIndents.get("/task/:taskId", async (c) => {
  const taskId = c.req.param("taskId");
  const workspaceId = c.req.query("w");

  if (!workspaceId) throw AppError.ValidationError("Missing workspaceId (w)");

  const indent = await IndentRepository.findByTaskId(taskId);
  return c.json({ success: true, data: indent });
});

/**
 * GET /api/v1/procurement/indents/line-items
 * Fetch all line items from approved indents in the workspace (with optional status/project filter)
 */
procurementIndents.get("/line-items", async (c) => {
  const user = c.get("user");
  const workspaceId = c.req.query("w");
  const statusFilters = parseMultiQuery(c.req.query("status"));
  const projectIds = parseMultiQuery(c.req.query("projectId"));

  if (!workspaceId) throw AppError.ValidationError("Missing workspaceId (w)");

  const perms = await getWorkspacePermissions(workspaceId, user.id);
  const allowedRoles = ["OWNER", "ADMIN", "MANAGER", "PROCUREMENT"];
  if (!perms || !allowedRoles.includes(perms.workspaceRole)) {
    throw AppError.Forbidden("Insufficient permissions to view workspace procurement line items");
  }

  const items = await prisma.indentLineItem.findMany({
    where: {
      indent: {
        workspaceId,
        ...(projectIds.length > 0 ? { projectId: { in: projectIds } } : {}),
      },
      ...(statusFilters.length > 0 ? { status: { in: statusFilters as any[] } } : {}),
    },
    include: {
      indent: {
        include: {
          project: { select: { id: true, name: true, slug: true } },
          requestedBy: {
            include: {
              user: {
                select: {
                  id: true,
                  surname: true,
                },
              },
            },
          },
        },
      },
      vendorQuotes: { select: { id: true, status: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const shaped = items.map((item) => ({
    id: item.id,
    materialName: item.materialName,
    unit: item.unit,
    quantity: item.quantity,
    specifications: item.specifications,
    status: item.status,
    rfqDeadline: item.rfqDeadline,
    indent: {
      id: item.indent.id,
      indentId: item.indent.indentId,
      name: item.indent.name,
      status: item.indent.status,
      project: item.indent.project,
      expectedDelivery: item.indent.expectedDelivery,
      requestedBy: item.indent.requestedBy,
    },
    quotesCount: item.vendorQuotes.length,
    hasApprovedQuote: item.vendorQuotes.some((q) => q.status === "APPROVED"),
  }));

  return c.json({ success: true, data: shaped });
});

/**
 * GET /api/v1/procurement/indents/:id
 * Get single indent with all items, requestedBy, assignee, project and task details
 */
procurementIndents.get("/:id", async (c) => {
  const id = c.req.param("id");
  const indent = await IndentRepository.findById(id);
  if (!indent) throw AppError.NotFound("Indent not found");
  return c.json({ success: true, data: indent });
});

/**
 * POST /api/v1/procurement/indents
 * Create a new indent, optionally including line items
 */
procurementIndents.post("/", zValidator("json", CreateIndentSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");

  const indent = await IndentService.createIndent(
    {
      taskId: body.taskId || undefined,
      projectId: body.projectId,
      workspaceId: body.workspaceId,
      name: body.name,
      description: body.description,
      expectedDelivery: body.expectedDelivery ? new Date(body.expectedDelivery) : undefined,
      lineItems: body.lineItems,
    },
    user.id
  );

  return c.json({ success: true, data: indent }, 201);
});

/**
 * POST /api/v1/procurement/indents/:id/submit
 * Submit indent for approval (DRAFT -> SUBMITTED)
 */
procurementIndents.post("/:id/submit", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const workspaceId = c.req.query("w");

  if (!workspaceId) throw AppError.ValidationError("Missing workspaceId (w)");

  const updated = await IndentService.submitIndent(id, user.id, workspaceId);
  return c.json({ success: true, data: updated });
});

/**
 * POST /api/v1/procurement/indents/:id/assign
 * Assign indent to a procurement staff (SUBMITTED -> ASSIGNED)
 */
procurementIndents.post("/:id/assign", zValidator("json", AssignIndentSchema), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const workspaceId = c.req.query("w");
  const { assigneeId } = c.req.valid("json");

  if (!workspaceId) throw AppError.ValidationError("Missing workspaceId (w)");

  const updated = await IndentService.assignIndent(id, assigneeId, user.id, workspaceId);
  return c.json({ success: true, data: updated });
});

/**
 * POST /api/v1/procurement/indents/:id/approve
 * Final approve indent (ASSIGNED/SUBMITTED -> APPROVED)
 */
procurementIndents.post("/:id/approve", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const workspaceId = c.req.query("w");

  if (!workspaceId) throw AppError.ValidationError("Missing workspaceId (w)");

  const updated = await IndentService.approveIndent(id, user.id, workspaceId);
  return c.json({ success: true, data: updated });
});

/**
 * POST /api/v1/procurement/indents/:id/cancel
 * Cancel an indent (transitions open items and quotes)
 */
procurementIndents.post("/:id/cancel", zValidator("json", CancelIndentSchema), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const workspaceId = c.req.query("w");
  const { reason } = c.req.valid("json");

  if (!workspaceId) throw AppError.ValidationError("Missing workspaceId (w)");

  await IndentService.cancelIndent(id, reason, user.id, workspaceId);
  return c.json({ success: true, message: "Indent cancelled successfully" });
});

/**
 * POST /api/v1/procurement/indents/:id/items
 * Add a line item to a DRAFT indent
 */
procurementIndents.post("/:id/items", zValidator("json", AddLineItemSchema), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const workspaceId = c.req.query("w");
  const body = c.req.valid("json");

  if (!workspaceId) throw AppError.ValidationError("Missing workspaceId (w)");

  const newItem = await IndentService.addLineItem(id, body, user.id, workspaceId);
  return c.json({ success: true, data: newItem }, 201);
});

/**
 * DELETE /api/v1/procurement/indents/:id/items/:itemId
 * Remove a line item from a DRAFT indent
 */
procurementIndents.delete("/:id/items/:itemId", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const itemId = c.req.param("itemId");
  const workspaceId = c.req.query("w");

  if (!workspaceId) throw AppError.ValidationError("Missing workspaceId (w)");

  await IndentService.removeLineItem(id, itemId, user.id, workspaceId);
  return c.json({ success: true, message: "Line item removed successfully" });
});

/**
 * PATCH /api/v1/procurement/indents/:id/items/:itemId
 * Update a line item in a DRAFT indent
 */
procurementIndents.patch("/:id/items/:itemId", zValidator("json", UpdateLineItemSchema), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const itemId = c.req.param("itemId");
  const workspaceId = c.req.query("w");
  const body = c.req.valid("json");

  if (!workspaceId) throw AppError.ValidationError("Missing workspaceId (w)");

  const updated = await IndentService.updateLineItem(id, itemId, body, user.id, workspaceId);
  return c.json({ success: true, data: updated });
});

/**
 * GET /api/v1/procurement/indents/:id/items/:itemId/suggested-vendors
 * Get intelligent vendor suggestions for a line item using trigram similarity
 */
procurementIndents.get("/:id/items/:itemId/suggested-vendors", async (c) => {
  const user = c.get("user");
  const indentId = c.req.param("id");
  const itemId = c.req.param("itemId");
  const workspaceId = c.req.query("w");

  if (!workspaceId) throw AppError.ValidationError("Missing workspaceId (w)");

  // Permission check
  const perms = await getWorkspacePermissions(workspaceId, user.id);
  if (perms.workspaceRole !== "PROCUREMENT" && !perms.isWorkspaceAdmin) {
    throw AppError.Forbidden("Insufficient permissions. Requires ADMIN or PROCUREMENT role.");
  }

  // 1. Fetch IndentLineItem to get materialName
  const lineItem = await prisma.indentLineItem.findFirst({
    where: {
      id: itemId,
      indentId: indentId,
      indent: { workspaceId }
    }
  });

  if (!lineItem) throw AppError.NotFound("Indent line item not found");

  // 2. Call VendorRepository.findSuggestedVendors
  const rawSuggestions = await VendorRepository.findSuggestedVendors(workspaceId, lineItem.materialName);

  // 3. Call VendorRepository.enrichSuggestions
  const enrichedSuggestions = await VendorRepository.enrichSuggestions(rawSuggestions);

  // 4. Return
  return c.json({ success: true, data: enrichedSuggestions });
});

/**
 * GET /api/v1/procurement/indents/projects/:projectId/tasks
 * Fetch available procurement tasks for a project
 */
procurementIndents.get("/projects/:projectId/tasks", async (c) => {
  const user = c.get("user");
  const projectId = c.req.param("projectId");
  const workspaceId = c.req.query("w");

  if (!workspaceId) throw AppError.ValidationError("Missing workspaceId (w)");

  const perms = await getWorkspacePermissions(workspaceId, user.id);
  if (!perms.hasAccess) {
    throw AppError.Forbidden("Access denied to this workspace");
  }

  // Fetch tasks that don't have an indent yet
  const [allTasks, existingIndents] = await Promise.all([
    prisma.task.findMany({
      where: {
        projectId,
        isParent: false,
        tags: {
          some: {
            OR: [
              { requirePurchase: true },
              { name: { equals: "procurement", mode: "insensitive" } },
            ],
          },
        },
      },
      select: { id: true, name: true, taskSlug: true, dueDate: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.indent.findMany({
      where: { projectId, taskId: { not: null } },
      select: { taskId: true },
    }),
  ]);

  const claimedTaskIds = new Set(existingIndents.map((i) => i.taskId));
  const tasks = allTasks.filter((t) => !claimedTaskIds.has(t.id));

  return c.json({ success: true, data: tasks });
});

export default procurementIndents;
