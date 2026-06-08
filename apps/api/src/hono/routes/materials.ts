import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { HonoVariables } from "../types";
import { AppError } from "@tusker/shared/errors";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";
import { getDb } from "@/lib/registry";

const materials = new Hono<{ Variables: HonoVariables }>();

/**
 * GET /api/v1/materials
 * List all active materials in a workspace catalog
 */
materials.get("/", async (c) => {
  const user = c.get("user");
  const workspaceId = c.req.query("w");

  if (!workspaceId) throw AppError.ValidationError("Missing workspaceId (w)");

  const perms = await getWorkspacePermissions(workspaceId, user.id);
  if (!perms.hasAccess) {
    throw AppError.Forbidden("Access denied to this workspace");
  }

  const catalog = await getDb().materialCatalog.findMany({
    where: { workspaceId },
    include: { defaultUnit: true },
    orderBy: { name: "asc" },
  });

  const formatted = catalog.map((m) => ({
    id: m.id,
    name: m.name,
    defaultUnit: m.defaultUnit
      ? { abbreviation: m.defaultUnit.abbreviation, name: m.defaultUnit.name }
      : m.unit
        ? { abbreviation: m.unit }
        : null,
  }));

  return c.json({ success: true, data: formatted });
});

/**
 * POST /api/v1/materials
 * Create or upsert a new material in the workspace catalog
 */
materials.post("/", zValidator("json", z.object({
  workspaceId: z.string(),
  name: z.string().min(1),
  unit: z.string().optional(),
})), async (c) => {
  const user = c.get("user");
  const data = c.req.valid("json");

  const perms = await getWorkspacePermissions(data.workspaceId, user.id);
  if (!perms.hasAccess) {
    throw AppError.Forbidden("Access denied to this workspace");
  }

  let defaultUnitId: string | undefined;
  if (data.unit) {
    const uom = await getDb().unitOfMeasure.findFirst({
      where: {
        workspaceId: data.workspaceId,
        abbreviation: { equals: data.unit, mode: "insensitive" },
      },
    });
    if (uom) {
      defaultUnitId = uom.id;
    }
  }

  const material = await getDb().materialCatalog.upsert({
    where: {
      workspaceId_name: {
        workspaceId: data.workspaceId,
        name: data.name.trim(),
      },
    },
    update: {
      unit: data.unit || undefined,
      defaultUnitId: defaultUnitId || undefined,
    },
    create: {
      workspaceId: data.workspaceId,
      name: data.name.trim(),
      unit: data.unit || null,
      source: "PLANNING",
      defaultUnitId,
    },
    include: {
      defaultUnit: true,
    },
  });

  return c.json({
    success: true,
    data: {
      id: material.id,
      name: material.name,
      defaultUnit: material.defaultUnit
        ? { abbreviation: material.defaultUnit.abbreviation, name: material.defaultUnit.name }
        : material.unit
          ? { abbreviation: material.unit }
          : null,
    },
  });
});

export default materials;
