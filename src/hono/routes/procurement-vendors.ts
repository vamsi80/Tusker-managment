import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { HonoVariables } from "../types";
import { AppError } from "@/lib/errors/app-error";
import { VendorService } from "@/server/services/procurement";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";
import prisma from "@/lib/db";

const procurementVendors = new Hono<{ Variables: HonoVariables }>();

const CreateVendorSchema = z.object({
  workspaceId: z.string(),
  name: z.string().min(2),
  companyName: z.string().optional(),
  contactPerson: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().optional(),
  addressLine1: z.string().optional().or(z.literal("")),
  addressLine2: z.string().optional().or(z.literal("")),
  city: z.string().optional().or(z.literal("")),
  state: z.string().optional().or(z.literal("")),
  pincode: z.string().optional().or(z.literal("")),
  country: z.string().optional().default("India"),
  gstNumber: z.string().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, "Invalid GST Format").optional().or(z.literal("")),
  phoneNumber: z.string().optional(),
});

const UpdateVendorSchema = CreateVendorSchema.omit({ workspaceId: true }).partial();

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
 * GET /api/v1/procurement/vendors/materials/all
 * List all active materials in a workspace
 */
procurementVendors.get("/materials/all", async (c) => {
  const user = c.get("user");
  const workspaceId = c.req.query("w");

  if (!workspaceId) throw AppError.ValidationError("Missing workspaceId (w)");

  const perms = await getWorkspacePermissions(workspaceId, user.id);
  if (!perms.hasAccess) {
    throw AppError.Forbidden("Access denied to this workspace");
  }

  const materials = await prisma.material.findMany({
    where: {
      workspaceId,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      defaultUnit: {
        select: {
          abbreviation: true,
        },
      },
    },
    orderBy: {
      name: "asc",
    },
  });

  const capabilities = await prisma.vendorMaterialCapability.findMany({
    where: {
      workspaceId,
    },
    select: {
      materialName: true,
      unit: true,
    },
    distinct: ["materialName"],
  });

  const merged: any[] = materials.map((m) => ({
    id: m.id,
    name: m.name,
    defaultUnit: m.defaultUnit,
  }));

  capabilities.forEach((cap) => {
    const exists = merged.some((m) => m.name.toLowerCase() === cap.materialName.toLowerCase());
    if (!exists) {
      merged.push({
        id: `cap-${cap.materialName}`,
        name: cap.materialName,
        defaultUnit: cap.unit ? { abbreviation: cap.unit } : null,
      });
    }
  });

  return c.json({ success: true, data: merged });
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

  const vendors = await prisma.vendor.findMany({
    where: {
      workspaceId,
      ...(search ? {
        name: { contains: search, mode: "insensitive" }
      } : {}),
      ...(status ? { status: status as any } : {}),
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

  const vendor = await prisma.vendor.findFirst({
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

  const vendor = await prisma.vendor.findFirst({ where: { id, workspaceId } });
  if (!vendor) throw AppError.NotFound("Vendor not found");

  const updated = await prisma.vendor.update({
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

  const capabilities = await prisma.vendorMaterialCapability.findMany({
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
