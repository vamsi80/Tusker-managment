import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@/hono/validator";
import { HonoVariables } from "../types";
import { AppError } from "@/lib/errors/app-error";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";
import prisma from "@/lib/db";
import {
  ensureMaterialCatalog,
  updateMaterialCatalog,
} from "@/server/services/procurement/material-catalog.service";
import { broadcastTeamUpdate } from "@/lib/realtime";

const materials = new Hono<{ Variables: HonoVariables }>();

const UpdateMaterialSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  unit: z.string().trim().max(50).nullable().optional(),
}).refine((data) => Object.keys(data).length > 0, "Provide at least one field to update");

const canManageCatalog = (perms: any) =>
  Boolean(perms.hasAccess || perms.isWorkspaceAdmin || perms.workspaceRole === "PROCUREMENT");

/**
 * GET /api/v1/materials
 * List all active materials in a workspace catalog
 */
materials.get("/", async (c) => {
  const user = c.get("user");
  const workspaceId = c.req.query("w");

  if (!workspaceId) throw AppError.ValidationError("Missing workspaceId (w)");

  const perms = await getWorkspacePermissions(workspaceId, user.id);
  if (!perms.hasAccess && !["PROCUREMENT", "ACCOUNTS"].includes(perms.workspaceRole)) {
    throw AppError.Forbidden("Access denied to this workspace");
  }

  const [catalog, pricedItems, vendorRates] = await Promise.all([
    prisma.materialCatalog.findMany({
      where: { workspaceId },
      include: { defaultUnit: true },
      orderBy: [{ materialId: "asc" }, { name: "asc" }],
    }),
    // What we last agreed to pay, newest first, so picking a remembered
    // material can carry its price into the new indent.
    prisma.indentLineItem.findMany({
      where: {
        indent: { workspaceId },
        OR: [{ finalUnitPrice: { not: null } }, { estimatedUnitPrice: { not: null } }],
      },
      select: {
        materialName: true,
        finalUnitPrice: true,
        estimatedUnitPrice: true,
        updatedAt: true,
        indent: {
          select: {
            selectedVendor: {
              select: { id: true, name: true, companyName: true },
            },
          },
        },
        approvedQuote: {
          select: {
            vendor: {
              select: { id: true, name: true, companyName: true },
            },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 2000,
    }),
    // Rates kept on a supplier's material list. Often the only price on record
    // for a material that has never been through a full indent.
    prisma.vendorMaterialCapability.findMany({
      where: { workspaceId, rate: { not: null } },
      select: {
        materialName: true,
        rate: true,
        vendor: {
          select: { id: true, name: true, companyName: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 2000,
    }),
  ]);

  type VendorSummary = { id: string; name: string; companyName: string | null };
  interface PriceEntry {
    price: number;
    vendor: VendorSummary | null;
  }

  // A rate actually paid beats one agreed with a supplier, which beats an old
  // estimate. First hit wins, and both lists are newest-first.
  const lastPriceByName = new Map<string, PriceEntry>();
  const remember = (
    name: string,
    price: number | null | undefined,
    vendor?: VendorSummary | null
  ) => {
    if (!price) return;
    const key = name.toLowerCase().trim();
    if (!lastPriceByName.has(key)) {
      lastPriceByName.set(key, { price, vendor: vendor ?? null });
    }
  };

  for (const item of pricedItems) {
    remember(
      item.materialName,
      item.finalUnitPrice,
      item.approvedQuote?.vendor ?? item.indent?.selectedVendor ?? null
    );
  }
  for (const capability of vendorRates) {
    remember(capability.materialName, capability.rate, capability.vendor);
  }
  for (const item of pricedItems) {
    remember(
      item.materialName,
      item.estimatedUnitPrice,
      item.indent?.selectedVendor ?? null
    );
  }

  // ponytail: ensure natural ascending order by materialId (e.g. MAT-0001, MAT-0002, ...)
  catalog.sort((a, b) =>
    (a.materialId || "").localeCompare(b.materialId || "", undefined, { numeric: true })
  );

  const formatted = catalog.map((m) => {
    const entry = lastPriceByName.get(m.name.toLowerCase().trim());
    return {
      id: m.id,
      materialId: m.materialId,
      name: m.name,
      // Paise, like every other price in procurement.
      lastPrice: entry?.price ?? null,
      vendor: entry?.vendor ?? null,
      defaultUnit: m.defaultUnit
        ? { abbreviation: m.defaultUnit.abbreviation, name: m.defaultUnit.name }
        : m.unit
          ? { abbreviation: m.unit }
          : null,
    };
  });

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
  if (!canManageCatalog(perms)) {
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

  broadcastTeamUpdate({
    workspaceId: data.workspaceId,
    type: "CREATE",
    payload: {
      action: "MATERIAL_CREATED",
      material: {
        id: material.id,
        materialId: material.materialId,
        name: material.name,
        unit: material.defaultUnit?.abbreviation || material.unit,
      },
    },
  }).catch((err) => console.error("Realtime broadcast error:", err));

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

/**
 * PATCH /api/v1/materials/:id
 * Edit a workspace master material name or default unit.
 */
materials.patch("/:id", zValidator("json", UpdateMaterialSchema), async (c) => {
  const user = c.get("user");
  const materialId = c.req.param("id");
  const workspaceId = c.req.query("w");

  if (!workspaceId) throw AppError.ValidationError("Missing workspaceId (w)");

  const perms = await getWorkspacePermissions(workspaceId, user.id);
  if (!canManageCatalog(perms)) {
    throw AppError.Forbidden("Access denied to this workspace");
  }

  const material = await updateMaterialCatalog(
    materialId,
    workspaceId,
    c.req.valid("json")
  );

  broadcastTeamUpdate({
    workspaceId,
    type: "UPDATE",
    payload: {
      action: "MATERIAL_UPDATED",
      material: {
        id: material.id,
        materialId: material.materialId,
        name: material.name,
        unit: material.defaultUnit?.abbreviation || material.unit,
      },
    },
  }).catch((err) => console.error("Realtime broadcast error:", err));

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

/**
 * DELETE /api/v1/materials/:id
 * Delete a material from the workspace catalog so its code can be recycled.
 */
materials.delete("/:id", async (c) => {
  const user = c.get("user");
  const materialId = c.req.param("id");
  const workspaceId = c.req.query("w");

  if (!workspaceId) throw AppError.ValidationError("Missing workspaceId (w)");

  const perms = await getWorkspacePermissions(workspaceId, user.id);
  if (!canManageCatalog(perms)) {
    throw AppError.Forbidden("Access denied to this workspace");
  }

  const existing = await prisma.materialCatalog.findFirst({
    where: {
      workspaceId,
      OR: [{ id: materialId }, { materialId: materialId }],
    },
    select: { id: true, materialId: true },
  });

  if (!existing) {
    throw AppError.NotFound("Material not found");
  }

  await prisma.materialCatalog.delete({
    where: { id: existing.id },
  });

  broadcastTeamUpdate({
    workspaceId,
    type: "DELETE",
    payload: {
      action: "MATERIAL_DELETED",
      id: existing.id,
      materialId: existing.materialId,
    },
  }).catch((err) => console.error("Realtime broadcast error:", err));

  return c.json({
    success: true,
    data: { id: existing.id, materialId: existing.materialId },
  });
});

export default materials;
