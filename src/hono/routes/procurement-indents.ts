import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@/hono/validator";
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
  projectId: z.string().optional().nullable(),
  // Set by the in-project entry points; the global hub leaves it false.
  raisedInProject: z.boolean().optional().default(false),
  workspaceId: z.string(),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  expectedDelivery: z.string().optional(),
  taxPercent: z.number().min(0).max(100).optional(),
  exciseDutyPercent: z.number().min(0).max(100).optional(),
  vatPercent: z.number().min(0).max(100).optional(),
  transportCharge: z.number().int().min(0).optional(),
  labourCharge: z.number().int().min(0).optional(),
  lineItems: z.array(
    z.object({
      materialCatalogId: z.string().optional(),
      materialName: z.string().min(1),
      unit: z.string().min(1),
      quantity: z.number().int().positive(),
      estimatedUnitPrice: z.number().int().positive().optional(),
      specifications: z.string().nullable().optional(),
    })
  ).optional(),
  approverIds: z
    .array(z.string().min(1))
    .min(1, "Select at least one owner for approval"),
});

const AddLineItemSchema = z.object({
  materialCatalogId: z.string().optional(),
  materialName: z.string().min(1),
  unit: z.string().min(1),
  quantity: z.number().int().positive(),
  estimatedUnitPrice: z.number().int().positive().optional(),
  specifications: z.string().nullable().optional(),
});

const UpdateLineItemSchema = z.object({
  materialCatalogId: z.string().optional(),
  materialName: z.string().min(1).optional(),
  unit: z.string().min(1).optional(),
  quantity: z.number().int().positive().optional(),
  estimatedUnitPrice: z.number().int().positive().optional(),
  finalUnitPrice: z.number().int().positive().optional(),
  specifications: z.string().nullable().optional(),
});

const CancelIndentSchema = z.object({
  reason: z.string().min(1),
});

const UpdateIndentSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  expectedDelivery: z.string().nullable().optional(),
  taxPercent: z.number().min(0).max(100).nullable().optional(),
  exciseDutyPercent: z.number().min(0).max(100).nullable().optional(),
  vatPercent: z.number().min(0).max(100).nullable().optional(),
  transportCharge: z.number().int().min(0).nullable().optional(),
  labourCharge: z.number().int().min(0).nullable().optional(),
  approverIds: z.array(z.string().min(1)).min(1).optional(),
});

const AssignIndentSchema = z.object({
  assigneeId: z.string(),
});

const SubmitFinalRatesSchema = z.object({
  vendorId: z.string().trim().min(1).optional(),
  rates: z.array(z.object({
    itemId: z.string(),
    finalUnitPrice: z.number().int().positive(),
  })).min(1),
});

const canReadProcurement = (perms: any) =>
  Boolean(perms?.hasAccess || ["OWNER", "ADMIN", "MANAGER", "PROCUREMENT", "ACCOUNTS"].includes(perms?.workspaceRole));

/**
 * GET /api/v1/procurement/indents/units
 * List all active units of measure in a workspace
 */
procurementIndents.get("/units", async (c) => {
  const user = c.get("user");
  const workspaceId = c.req.query("w");

  if (!workspaceId) throw AppError.ValidationError("Missing workspaceId (w)");

  const perms = await getWorkspacePermissions(workspaceId, user.id);
  if (!canReadProcurement(perms)) {
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
  if (!canReadProcurement(perms)) {
    throw AppError.Forbidden("Access denied to this workspace");
  }

  const indents = await prisma.indent.findMany({
    where: { workspaceId },
    include: {
      project: { select: { id: true, name: true, slug: true } },
      requestedBy: { select: { user: { select: { name: true, surname: true } } } },
      assignedTo: {
        select: {
          id: true,
          user: { select: { name: true, surname: true } },
        },
      },
      selectedVendor: { select: { id: true, name: true, companyName: true } },
      task: { select: { name: true } },
      lineItems: {
        select: {
          quantity: true,
          estimatedUnitPrice: true,
          finalUnitPrice: true,
        },
      },
      _count: { select: { lineItems: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const shaped = indents.map(({ lineItems, ...indent }) => ({
    ...indent,
    estimatedTotal: lineItems.reduce(
      (total, item) => total + (item.estimatedUnitPrice || 0) * item.quantity,
      0
    ),
    finalTotal: lineItems.every((item) => item.finalUnitPrice != null)
      ? lineItems.reduce((total, item) => total + (item.finalUnitPrice || 0) * item.quantity, 0)
      : null,
  }));

  return c.json({ success: true, data: shaped });
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
  const allowedRoles = ["OWNER", "ADMIN", "MANAGER", "PROCUREMENT", "ACCOUNTS"];
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
      material: {
        select: {
          id: true,
          materialId: true,
          name: true,
        },
      },
      approvedQuote: {
        select: {
          id: true,
          unitPrice: true,
          vendor: { select: { id: true, name: true, companyName: true } },
        },
      },
      indent: {
        include: {
          project: { select: { id: true, name: true, slug: true } },
          selectedVendor: { select: { id: true, name: true, companyName: true } },
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
    materialCatalogId: item.materialCatalogId,
    materialId: item.material?.materialId || null,
    material: item.material,
    materialName: item.materialName,
    unit: item.unit,
    quantity: item.quantity,
    estimatedUnitPrice: item.estimatedUnitPrice,
    finalUnitPrice: item.finalUnitPrice,
    specifications: item.specifications,
    status: item.status,
    rfqDeadline: item.rfqDeadline,
    vendor: item.approvedQuote?.vendor || item.indent.selectedVendor || null,
    indent: {
      id: item.indent.id,
      indentId: item.indent.indentId,
      name: item.indent.name,
      status: item.indent.status,
      rejectedStage: item.indent.rejectedStage,
      project: item.indent.project,
      selectedVendor: item.indent.selectedVendor,
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
  const user = c.get("user");
  const id = c.req.param("id");
  const workspaceId = c.req.query("w");
  if (!workspaceId) throw AppError.ValidationError("Missing workspaceId (w)");
  const perms = await getWorkspacePermissions(workspaceId, user.id);
  if (!canReadProcurement(perms)) throw AppError.Forbidden("Access denied to procurement");
  const indent = await IndentRepository.findById(id);
  if (!indent || indent.workspaceId !== workspaceId) throw AppError.NotFound("Indent not found");
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
      raisedInProject: body.raisedInProject,
      workspaceId: body.workspaceId,
      name: body.name,
      description: body.description,
      expectedDelivery: body.expectedDelivery ? new Date(body.expectedDelivery) : undefined,
      taxPercent: body.taxPercent,
      exciseDutyPercent: body.exciseDutyPercent,
      vatPercent: body.vatPercent,
      transportCharge: body.transportCharge,
      labourCharge: body.labourCharge,
      lineItems: body.lineItems,
      approverIds: body.approverIds,
    },
    user.id
  );

  return c.json({ success: true, data: indent }, 201);
});

/**
 * PATCH /api/v1/procurement/indents/:id
 * Edit an indent's own details (owner / admin / manager, or the requester while it is editable)
 */
procurementIndents.patch("/:id", zValidator("json", UpdateIndentSchema), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const workspaceId = c.req.query("w");
  const body = c.req.valid("json");

  if (!workspaceId) throw AppError.ValidationError("Missing workspaceId (w)");

  const updated = await IndentService.updateIndent(
    id,
    {
      ...body,
      expectedDelivery:
        body.expectedDelivery === undefined
          ? undefined
          : body.expectedDelivery
            ? new Date(body.expectedDelivery)
            : null,
    },
    user.id,
    workspaceId
  );
  return c.json({ success: true, data: updated });
});

/**
 * DELETE /api/v1/procurement/indents/:id
 * Delete an indent and its line items (owner / admin / manager)
 */
procurementIndents.delete("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const workspaceId = c.req.query("w");

  if (!workspaceId) throw AppError.ValidationError("Missing workspaceId (w)");

  await IndentService.deleteIndent(id, user.id, workspaceId);
  return c.json({ success: true, message: "Indent deleted successfully" });
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
 * POST /api/v1/procurement/indents/:id/reject
 * Return an indent to its requester for an editable, stage-aware revision.
 */
procurementIndents.post("/:id/reject", zValidator("json", CancelIndentSchema), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const workspaceId = c.req.query("w");
  const { reason } = c.req.valid("json");
  if (!workspaceId) throw AppError.ValidationError("Missing workspaceId (w)");
  const updated = await IndentService.rejectIndent(id, reason, user.id, workspaceId);
  return c.json({ success: true, data: updated });
});

/**
 * POST /api/v1/procurement/indents/:id/resubmit
 * Resubmit a rejected estimate or rejected final-rate revision.
 */
procurementIndents.post("/:id/resubmit", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const workspaceId = c.req.query("w");
  if (!workspaceId) throw AppError.ValidationError("Missing workspaceId (w)");
  const updated = await IndentService.resubmitIndent(id, user.id, workspaceId);
  return c.json({ success: true, data: updated });
});

/**
 * POST /api/v1/procurement/indents/:id/final-rates
 * Save manual final rates and send them to the requester's manager.
 */
procurementIndents.post("/:id/final-rates", zValidator("json", SubmitFinalRatesSchema), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const workspaceId = c.req.query("w");
  const { rates, vendorId } = c.req.valid("json");
  if (!workspaceId) throw AppError.ValidationError("Missing workspaceId (w)");
  const updated = await IndentService.submitFinalRates(id, rates, vendorId, user.id, workspaceId);
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
  if (!canReadProcurement(perms)) {
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
