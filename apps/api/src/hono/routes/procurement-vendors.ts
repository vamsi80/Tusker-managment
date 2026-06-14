import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { HonoVariables } from "../types";
import { AppError } from "@tusker/shared/errors";
import { VendorService } from "@/server/services/procurement";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";
import { getDb } from "@/lib/registry";
import type { VendorStatus } from "@/generated/prisma";
import { CreateVendorSchema, UpdateVendorSchema } from "@/hono/schemas";

const procurementVendors = new Hono<{ Variables: HonoVariables }>();

// Permission middleware helper
const checkProcurementPerms = async (workspaceId: string, userId: string) => {
  const perms = await getWorkspacePermissions(workspaceId, userId);
  if (perms.workspaceRole !== "PROCUREMENT" && !perms.isWorkspaceAdmin) {
    throw AppError.Forbidden("Insufficient permissions. Requires ADMIN or PROCUREMENT role.");
  }
};

/**
 * POST /api/v1/procurement/vendors
 * Create a new vendor
 */
procurementVendors.post("/", zValidator("json", CreateVendorSchema), async (c) => {
  const user = c.get("user");
  const data = c.req.valid("json");

  await checkProcurementPerms(data.workspaceId, user.id);

  const vendor = await VendorService.createVendor(data);
  return c.json({ success: true, data: vendor }, 201);
});

/**
 * GET /api/v1/procurement/vendors/materials/coverage
 * Get list of all materials and their vendor coverage
 */
procurementVendors.get("/materials/coverage", async (c) => {
  const user = c.get("user");
  const workspaceId = c.req.query("w");

  if (!workspaceId) throw AppError.ValidationError("Missing workspaceId (w)");

  const perms = await getWorkspacePermissions(workspaceId, user.id);
  if (!perms.hasAccess) {
    throw AppError.Forbidden("Access denied to this workspace");
  }

  const catalog = await getDb().materialCatalog.findMany({
    where: { workspaceId },
    orderBy: { name: "asc" },
  });

  const capabilities = await getDb().vendorMaterialCapability.findMany({
    where: { workspaceId },
    include: {
      vendor: {
        select: {
          id: true,
          name: true,
          status: true,
        },
      },
    },
  });

  const coverageMap = new Map<string, { materialName: string; unit: string | null; vendors: { id: string; name: string }[] }>();

  catalog.forEach((m) => {
    coverageMap.set(m.name.toLowerCase().trim(), {
      materialName: m.name,
      unit: m.unit,
      vendors: [],
    });
  });

  capabilities.forEach((cap) => {
    const key = cap.materialName.toLowerCase().trim();
    const entry = coverageMap.get(key);
    if (entry) {
      const exists = entry.vendors.some((v) => v.id === cap.vendor.id);
      if (!exists && cap.vendor.status === "ACTIVE") {
        entry.vendors.push({
          id: cap.vendor.id,
          name: cap.vendor.name,
        });
      }
    } else {
      coverageMap.set(key, {
        materialName: cap.materialName,
        unit: cap.unit || null,
        vendors: [{ id: cap.vendor.id, name: cap.vendor.name }],
      });
    }
  });

  const result = Array.from(coverageMap.values()).map((entry) => ({
    materialName: entry.materialName,
    unit: entry.unit,
    vendorCount: entry.vendors.length,
    vendors: entry.vendors,
  }));

  return c.json({ success: true, data: result });
});

/**
 * GET /api/v1/procurement/vendors
 * List vendors
 */
procurementVendors.get("/", async (c) => {
  const user = c.get("user");
  const workspaceId = c.req.query("w");
  const search = c.req.query("search");
  const status = c.req.query("status"); // e.g. ACTIVE

  if (!workspaceId) throw AppError.ValidationError("Missing workspaceId (w)");

  // Any member can read vendors
  const perms = await getWorkspacePermissions(workspaceId, user.id);
  if (!perms.hasAccess) {
    throw AppError.Forbidden("Access denied to this workspace");
  }

  const vendors = await getDb().vendor.findMany({
    where: {
      workspaceId,
      ...(search ? {
        name: { contains: search, mode: "insensitive" }
      } : {}),
      ...(status ? { status: status as VendorStatus } : {}),
    },
    orderBy: { createdAt: "desc" }
  });

  return c.json({ success: true, data: vendors });
});

/**
 * GET /api/v1/procurement/vendors/:id
 * Get single vendor details
 */
procurementVendors.get("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const workspaceId = c.req.query("w");

  if (!workspaceId) throw AppError.ValidationError("Missing workspaceId (w)");

  const perms = await getWorkspacePermissions(workspaceId, user.id);
  if (!perms.hasAccess) {
    throw AppError.Forbidden("Access denied to this workspace");
  }

  const vendor = await getDb().vendor.findFirst({
    where: { id, workspaceId }
  });

  if (!vendor) throw AppError.NotFound("Vendor not found");

  return c.json({ success: true, data: vendor });
});

/**
 * PATCH /api/v1/procurement/vendors/:id
 * Update vendor fields
 */
procurementVendors.patch("/:id", zValidator("json", UpdateVendorSchema), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const workspaceId = c.req.query("w");
  const data = c.req.valid("json");

  if (!workspaceId) throw AppError.ValidationError("Missing workspaceId (w)");

  const perms = await getWorkspacePermissions(workspaceId, user.id);
  if (!perms.isWorkspaceAdmin) {
    throw AppError.Forbidden("Only Workspace Admins can edit vendor details");
  }

  const vendor = await getDb().vendor.findFirst({ where: { id, workspaceId } });
  if (!vendor) throw AppError.NotFound("Vendor not found");

  const updated = await getDb().vendor.update({
    where: { id },
    data,
  });

  return c.json({ success: true, data: updated });
});

/**
 * DELETE /api/v1/procurement/vendors/:id
 * Soft delete (blacklist / deactivate) vendor
 */
procurementVendors.delete("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const workspaceId = c.req.query("w");

  if (!workspaceId) throw AppError.ValidationError("Missing workspaceId (w)");

  const perms = await getWorkspacePermissions(workspaceId, user.id);
  if (perms.workspaceRole !== "OWNER" && !perms.isWorkspaceAdmin) {
    throw AppError.Forbidden("Only Workspace Admins or Owners can delete vendors");
  }

  // Use the blacklist method or just soft delete
  const updated = await VendorService.blacklistVendor(id, workspaceId);

  return c.json({ success: true, data: updated });
});

/**
 * GET /api/v1/procurement/vendors/:id/capabilities
 * List capabilities for a vendor
 */
procurementVendors.get("/:id/capabilities", async (c) => {
  const user = c.get("user");
  const vendorId = c.req.param("id");
  const workspaceId = c.req.query("w");

  if (!workspaceId) throw AppError.ValidationError("Missing workspaceId (w)");

  const perms = await getWorkspacePermissions(workspaceId, user.id);
  if (perms.workspaceRole !== "PROCUREMENT" && !perms.isWorkspaceAdmin) {
    throw AppError.Forbidden("Insufficient permissions");
  }

  const capabilities = await getDb().vendorMaterialCapability.findMany({
    where: { vendorId, workspaceId },
    orderBy: { createdAt: "desc" }
  });

  return c.json({ success: true, data: capabilities });
});

/**
 * POST /api/v1/procurement/vendors/:id/capabilities
 * Add manual capability
 */
procurementVendors.post("/:id/capabilities", zValidator("json", z.object({
  materialName: z.string().min(1),
  unit: z.string().optional(),
  serviceType: z.enum(["SUPPLY", "LABOUR", "LABOUR_WITH_MATERIAL"]).optional().default("SUPPLY"),
})), async (c) => {
  const user = c.get("user");
  const vendorId = c.req.param("id");
  const workspaceId = c.req.query("w");
  const data = c.req.valid("json");

  if (!workspaceId) throw AppError.ValidationError("Missing workspaceId (w)");

  await checkProcurementPerms(workspaceId, user.id);

  const capability = await VendorService.addManualCapability(
    vendorId,
    workspaceId,
    data.materialName,
    data.unit,
    data.serviceType
  );

  return c.json({ success: true, data: capability }, 201);
});

/**
 * DELETE /api/v1/procurement/vendors/:id/capabilities/:capId
 * Remove capability
 */
procurementVendors.delete("/:id/capabilities/:capId", async (c) => {
  const user = c.get("user");
  const vendorId = c.req.param("id");
  const capId = c.req.param("capId");
  const workspaceId = c.req.query("w");

  if (!workspaceId) throw AppError.ValidationError("Missing workspaceId (w)");

  await checkProcurementPerms(workspaceId, user.id);

  await VendorService.removeCapability(capId, workspaceId);

  return c.json({ success: true });
});

export default procurementVendors;
