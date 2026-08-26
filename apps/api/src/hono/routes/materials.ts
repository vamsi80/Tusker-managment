import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "../validator";
import { HonoVariables } from "../types";
import { AppError } from "@tusker/core/lib/errors/app-error";
import { fetchWorkspacePermissions } from "@tusker/core/permissions";
import prisma from "@tusker/db";
import { ensureMaterialCatalog } from "@tusker/core/server/services/procurement/material-catalog.service";

const materials = new Hono<{ Variables: HonoVariables }>();

/**
 * GET /api/v1/materials
 * List all active materials in a workspace catalog
 */
materials.get("/", async (c) => {
  const user = c.get("user");
  const workspaceId = c.req.query("w");

  if (!workspaceId) throw AppError.ValidationError("Missing workspaceId (w)");

  const perms = await fetchWorkspacePermissions(workspaceId, user.id);
  if (!perms.hasAccess && !["PROCUREMENT", "ACCOUNTS"].includes(perms.workspaceRole)) {
    throw AppError.Forbidden("Access denied to this workspace");
  }

  const catalog = await prisma.materialCatalog.findMany({
    where: { workspaceId },
    include: { defaultUnit: true },
    orderBy: { name: "asc" },
  });

  const formatted = catalog.map((m) => ({
    id: m.id,
    materialId: m.materialId,
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

  const perms = await fetchWorkspacePermissions(data.workspaceId, user.id);
  if (!perms.hasAccess) {
    throw AppError.Forbidden("Access denied to this workspace");
  }

  let defaultUnitId: string | undefined;
  if (data.unit) {
    const uom = await prisma.unitOfMeasure.findFirst({
      where: {
        workspaceId: data.workspaceId,
        abbreviation: { equals: data.unit, mode: "insensitive" },
      },
    });
    if (uom) {
      defaultUnitId = uom.id;
    }
  }

  const material = await prisma.$transaction(async (tx) => {
    const saved = await ensureMaterialCatalog(tx, {
      workspaceId: data.workspaceId,
      name: data.name,
      unit: data.unit,
      source: "PLANNING",
      defaultUnitId,
    });

    return tx.materialCatalog.findUniqueOrThrow({
      where: { id: saved.id },
      include: { defaultUnit: true },
    });
  });

  return c.json({
    success: true,
    data: {
      id: material.id,
      materialId: material.materialId,
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
