import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "../validator";
import { HonoVariables } from "../types";
import { AppError } from "@tusker/core/lib/errors/app-error";
import { fetchWorkspacePermissions } from "@tusker/core/permissions";
import { can, type Capability } from "@tusker/core/lib/constants/capabilities";
import { BoqService } from "@tusker/core/server/services/procurement/index";
import { LENGTH_UNITS, type LengthUnit } from "@tusker/core/lib/procurement/boq";

/**
 * BOQ, rate sheet and trades, mounted at /procurement. Every handler checks its
 * own Settings -> Permissions capability: these rows start owner/admin only.
 */
const procurementBoq = new Hono<{ Variables: HonoVariables }>();

const workspaceOf = (c: any): string => {
  const id = c.req.query("w") || c.req.header("x-workspace-id");
  if (!id) throw AppError.ValidationError("Missing workspaceId (w)");
  return id;
};

/** Passes when the member holds any one of `caps`; returns the member id. */
async function requireAny(c: any, ...caps: Capability[]) {
  const workspaceId = workspaceOf(c);
  const perms = await fetchWorkspacePermissions(workspaceId, c.get("user").id);
  if (!perms.workspaceMemberId || !caps.some((cap) => can(perms.capabilities, cap))) {
    throw AppError.Forbidden("You don't have access to this.");
  }
  return { workspaceId, memberId: perms.workspaceMemberId as string, capabilities: perms.capabilities };
}

const Name = z.string().trim().min(1).max(120);
const Dimension = z.number().nonnegative().max(1_000_000).nullable().optional();

const LineSchema = z.object({
  tradeId: z.string().min(1),
  zoneId: z.string().min(1).nullable().optional(),
  capabilityId: z.string().min(1).nullable().optional(),
  vendorId: z.string().min(1).nullable().optional(),
  description: z.string().trim().min(1).max(500).optional(),
  unit: z.string().trim().min(1).max(30).optional(),
  // Paise per unit.
  rate: z.number().int().nonnegative().optional(),
  inputUnit: z.enum(Object.keys(LENGTH_UNITS) as [LengthUnit, ...LengthUnit[]]).optional(),
  length: Dimension,
  breadth: Dimension,
  depth: Dimension,
  quantity: z.number().positive().max(1_000_000).optional(),
  markupPercent: z.number().min(0).max(1000).optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

// Trades ---------------------------------------------------------------------

procurementBoq.get("/trades", async (c) => {
  const { workspaceId } = await requireAny(c, "ratesheet:view", "boq:view");
  return c.json({ success: true, data: await BoqService.listTrades(workspaceId) });
});

procurementBoq.post("/trades", zValidator("json", z.object({ name: Name })), async (c) => {
  const { workspaceId } = await requireAny(c, "ratesheet:edit", "boq:edit");
  return c.json({ success: true, data: await BoqService.createTrade(workspaceId, c.req.valid("json").name) }, 201);
});

// Rate sheet -----------------------------------------------------------------

procurementBoq.get("/rate-sheet", async (c) => {
  // The BOQ editor reads contractor rates too.
  const { workspaceId } = await requireAny(c, "ratesheet:view", "boq:view");
  const kind = c.req.query("kind");
  if (kind && !["material", "labour", "labour_material"].includes(kind)) {
    throw AppError.ValidationError("kind must be material, labour or labour_material");
  }
  const data = await BoqService.rateSheet(workspaceId, kind as any, c.req.query("tradeId") || undefined);
  return c.json({ success: true, data });
});

// Zones (registered before /boq/:id so "zones" is never read as an id) -------

procurementBoq.post(
  "/boq/zones",
  zValidator("json", z.object({ projectId: z.string().min(1), name: Name })),
  async (c) => {
    const { workspaceId } = await requireAny(c, "boq:edit");
    const { projectId, name } = c.req.valid("json");
    return c.json({ success: true, data: await BoqService.createZone(workspaceId, projectId, name) }, 201);
  }
);

procurementBoq.patch(
  "/boq/zones/:zoneId",
  zValidator("json", z.object({ projectId: z.string().min(1), name: Name })),
  async (c) => {
    const { workspaceId } = await requireAny(c, "boq:edit");
    const { projectId, name } = c.req.valid("json");
    return c.json({ success: true, data: await BoqService.renameZone(workspaceId, projectId, c.req.param("zoneId"), name) });
  }
);

procurementBoq.delete("/boq/zones/:zoneId", async (c) => {
  const { workspaceId } = await requireAny(c, "boq:edit");
  const projectId = c.req.query("projectId");
  if (!projectId) throw AppError.ValidationError("Missing projectId");
  await BoqService.deleteZone(workspaceId, projectId, c.req.param("zoneId"));
  return c.json({ success: true });
});

// BOQs -----------------------------------------------------------------------

procurementBoq.get("/boq", async (c) => {
  const { workspaceId } = await requireAny(c, "boq:view");
  return c.json({ success: true, data: await BoqService.listBoqs(workspaceId, c.req.query("projectId") || undefined) });
});

procurementBoq.post(
  "/boq",
  zValidator("json", z.object({ projectId: z.string().min(1), name: Name })),
  async (c) => {
    const { workspaceId, memberId } = await requireAny(c, "boq:edit");
    const { projectId, name } = c.req.valid("json");
    return c.json({ success: true, data: await BoqService.createBoq(workspaceId, projectId, name, memberId) }, 201);
  }
);

procurementBoq.get("/boq/:id", async (c) => {
  const { workspaceId } = await requireAny(c, "boq:view");
  return c.json({ success: true, data: await BoqService.getBoq(workspaceId, c.req.param("id")) });
});

procurementBoq.delete("/boq/:id", async (c) => {
  const { workspaceId } = await requireAny(c, "boq:edit");
  await BoqService.deleteBoq(workspaceId, c.req.param("id"));
  return c.json({ success: true });
});

procurementBoq.post(
  "/boq/:id/status",
  zValidator("json", z.object({ status: z.enum(["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"]) })),
  async (c) => {
    const { status } = c.req.valid("json");
    const decision = status === "APPROVED" || status === "REJECTED";
    const { workspaceId } = await requireAny(c, decision ? "boq:approve" : "boq:edit");
    return c.json({ success: true, data: await BoqService.setStatus(workspaceId, c.req.param("id"), status) });
  }
);

procurementBoq.post("/boq/:id/revise", async (c) => {
  const { workspaceId, memberId } = await requireAny(c, "boq:edit");
  return c.json({ success: true, data: await BoqService.reviseBoq(workspaceId, c.req.param("id"), memberId) }, 201);
});

procurementBoq.post("/boq/:id/lines", zValidator("json", LineSchema), async (c) => {
  const { workspaceId } = await requireAny(c, "boq:edit");
  return c.json({ success: true, data: await BoqService.addLine(workspaceId, c.req.param("id"), c.req.valid("json")) }, 201);
});

procurementBoq.patch("/boq/:id/lines/:lineId", zValidator("json", LineSchema.partial()), async (c) => {
  const { workspaceId } = await requireAny(c, "boq:edit");
  const line = await BoqService.updateLine(workspaceId, c.req.param("id"), c.req.param("lineId"), c.req.valid("json"));
  return c.json({ success: true, data: line });
});

procurementBoq.delete("/boq/:id/lines/:lineId", async (c) => {
  const { workspaceId } = await requireAny(c, "boq:edit");
  await BoqService.deleteLine(workspaceId, c.req.param("id"), c.req.param("lineId"));
  return c.json({ success: true });
});

export default procurementBoq;
