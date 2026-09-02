import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@/hono/validator";
import { HonoVariables } from "../types";
import { AppError } from "@/lib/errors/app-error";
import { lookupGstin, VendorService } from "@/server/services/procurement";
import { validateGstin } from "@/lib/procurement/gstin";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";
import prisma from "@/lib/db";
import { Prisma } from "@/generated/prisma";

const procurementVendors = new Hono<{ Variables: HonoVariables }>();

/**
 * Header text as the vendor writes it → the indent field it feeds. Kept as a
 * plain record so a vendor renaming one column does not invalidate the rest.
 */
const QuotationMappingSchema = z.object({
  mapping: z
    .record(
      z.string().min(1).max(120),
      z.enum(["itemName", "description", "quantity", "unit", "unitPrice", "amount"])
    )
    .nullable(),
});

const GstRegistryField = z.string().max(255).nullable().optional();
const OptionalVendorField = z.string().max(255).nullable().optional();

const CreateVendorSchema = z.object({
  workspaceId: z.string(),
  name: OptionalVendorField,
  companyName: OptionalVendorField,
  contactPerson: OptionalVendorField,
  email: z.string().email().nullable().optional().or(z.literal("")),
  address: OptionalVendorField,
  addressLine1: OptionalVendorField,
  addressLine2: OptionalVendorField,
  city: OptionalVendorField,
  state: OptionalVendorField,
  pincode: OptionalVendorField,
  country: OptionalVendorField,
  hasGst: z.boolean().optional(),
  // Same check the lookup field runs, so a vendor saved without pressing
  // Verify still cannot carry a mistyped GSTIN.
  gstNumber: z.string().superRefine((value, ctx) => {
    const result = validateGstin(value);
    if (!result.valid) ctx.addIssue({ code: "custom", message: result.error });
  }).nullable().optional().or(z.literal("")),
  phoneNumber: OptionalVendorField,
  // GST registry snapshot. Nullable so clearing a field in the form actually
  // clears the column — an omitted key would leave the old value in place.
  gstStatus: GstRegistryField,
  taxpayerType: GstRegistryField,
  businessConstitution: GstRegistryField,
  gstRegistrationDate: GstRegistryField,
  gstCancellationDate: GstRegistryField,
  stateJurisdiction: GstRegistryField,
  natureOfBusiness: GstRegistryField,
  blockStatus: GstRegistryField,
  einvoiceStatus: GstRegistryField,
});

const UpdateVendorSchema = CreateVendorSchema.omit({ workspaceId: true }).partial().extend({
  status: z.enum(["ACTIVE", "BLACKLISTED"]).optional(),
});

const GstinLookupSchema = z.object({
  workspaceId: z.string().min(1),
  gstin: z.string().min(1),
});

const CapabilityLinkSchema = z
  .string()
  .trim()
  .url()
  .regex(/^https?:\/\//i, "Link must start with http:// or https://")
  .nullable()
  .optional();

const UpdateCapabilitySchema = z.object({
  materialName: z.string().trim().min(1).max(255).optional(),
  unit: z.string().trim().max(50).nullable().optional(),
  serviceType: z.enum(["SUPPLY", "LABOUR", "LABOUR_WITH_MATERIAL"]).optional(),
  rate: z.number().int().positive().nullable().optional(),
  quantity: z.number().int().positive().nullable().optional(),
  link: CapabilityLinkSchema,
}).refine((data) => Object.keys(data).length > 0, "Provide at least one field to update");

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
 * POST /api/v1/procurement/vendors/gstin/lookup
 * Verify a GSTIN without exposing the provider API key to the browser.
 */
procurementVendors.post("/gstin/lookup", zValidator("json", GstinLookupSchema), async (c) => {
  const user = c.get("user");
  const { workspaceId, gstin } = c.req.valid("json");

  await checkProcurementPerms(workspaceId, user.id);

  const result = await lookupGstin(gstin);
  return c.json({
    success: true,
    data: result.data,
    meta: { cached: result.cached },
  });
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
  if (!perms.hasAccess && !["PROCUREMENT", "ACCOUNTS"].includes(perms.workspaceRole)) {
    throw AppError.Forbidden("Access denied to this workspace");
  }

  const catalog = await prisma.materialCatalog.findMany({
    where: { workspaceId },
    orderBy: { name: "asc" },
  });

  const capabilities = await prisma.vendorMaterialCapability.findMany({
    where: { workspaceId },
    include: {
      vendor: {
        select: {
          id: true,
          vendorId: true,
          name: true,
          status: true,
        },
      },
      material: {
        select: {
          materialId: true,
        },
      },
    },
  });

  const coverageMap = new Map<
    string,
    {
      materialId: string | null;
      materialName: string;
      unit: string | null;
      vendors: { id: string; vendorId: string; name: string }[];
    }
  >();

  catalog.forEach((m) => {
    coverageMap.set(m.name.toLowerCase().trim(), {
      materialId: m.materialId,
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
          vendorId: cap.vendor.vendorId,
          name: cap.vendor.name,
        });
      }
    } else {
      coverageMap.set(key, {
        materialId: cap.material?.materialId || null,
        materialName: cap.materialName,
        unit: cap.unit || null,
        vendors: [{ id: cap.vendor.id, vendorId: cap.vendor.vendorId, name: cap.vendor.name }],
      });
    }
  });

  const result = Array.from(coverageMap.values()).map((entry) => ({
    materialId: entry.materialId,
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
  if (!perms.hasAccess && !["PROCUREMENT", "ACCOUNTS"].includes(perms.workspaceRole)) {
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
  if (!perms.hasAccess && !["PROCUREMENT", "ACCOUNTS"].includes(perms.workspaceRole)) {
    throw AppError.Forbidden("Access denied to this workspace");
  }

  const vendor = await prisma.vendor.findFirst({
    where: { id, workspaceId }
  });

  if (!vendor) throw AppError.NotFound("Supplier / contractor not found");

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
    throw AppError.Forbidden("Only Workspace Admins can edit supplier / contractor details");
  }

  const vendor = await prisma.vendor.findFirst({ where: { id, workspaceId } });
  if (!vendor) throw AppError.NotFound("Supplier / contractor not found");

  const hasGst = data.hasGst ?? vendor.hasGst;
  const { name, ...updateData } = data;
  const gstData = hasGst
    ? {}
    : {
        gstNumber: null,
        gstStatus: null,
        taxpayerType: null,
        businessConstitution: null,
        gstRegistrationDate: null,
        gstCancellationDate: null,
        stateJurisdiction: null,
        natureOfBusiness: null,
        blockStatus: null,
        einvoiceStatus: null,
      };

  const updated = await prisma.vendor.update({
    where: { id },
    data: {
      ...updateData,
      ...(name !== undefined ? { name: name?.trim() || "-" } : {}),
      hasGst,
      ...gstData,
    },
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
    throw AppError.Forbidden("Only Workspace Admins or Owners can delete suppliers / contractors");
  }

  // ?permanent=true removes the row outright; the default stays a soft delete
  // so the list's Blacklist action keeps working unchanged.
  if (c.req.query("permanent") === "true") {
    await VendorService.deleteVendor(id, workspaceId);
    return c.json({ success: true });
  }

  const updated = await VendorService.blacklistVendor(id, workspaceId);

  return c.json({ success: true, data: updated });
});

/**
 * GET /api/v1/procurement/vendors/:id/materials
 * Everything we buy from this supplier / contractor in one list: line items of
 * approved indents awarded to them, plus materials added by hand with an agreed
 * rate, so a material with no indent behind it still carries a price.
 */
procurementVendors.get("/:id/materials", async (c) => {
  const user = c.get("user");
  const vendorId = c.req.param("id");
  const workspaceId = c.req.query("w");

  if (!workspaceId) throw AppError.ValidationError("Missing workspaceId (w)");

  const perms = await getWorkspacePermissions(workspaceId, user.id);
  if (!perms.hasAccess && !["PROCUREMENT", "ACCOUNTS"].includes(perms.workspaceRole)) {
    throw AppError.Forbidden("Access denied to this workspace");
  }

  const [capabilities, items] = await Promise.all([
    prisma.vendorMaterialCapability.findMany({
      where: { vendorId, workspaceId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.indentLineItem.findMany({
      where: {
        indent: { workspaceId, status: "APPROVED" },
        // A vendor wins either the whole indent (selectedVendor) or a single line
        // item through its approved quote. Both count as buying from them.
        OR: [{ indent: { selectedVendorId: vendorId } }, { approvedQuote: { vendorId } }],
      },
      select: {
        id: true,
        materialName: true,
        unit: true,
        quantity: true,
        finalUnitPrice: true,
        estimatedUnitPrice: true,
        approvedQuote: { select: { unitPrice: true } },
        indent: {
          select: {
            id: true,
            indentId: true,
            name: true,
            finalApprovedAt: true,
            project: { select: { name: true } },
          },
        },
      },
      orderBy: { indent: { finalApprovedAt: "desc" } },
    }),
  ]);

  // Every rate here is paise, so the fallback chain stays comparable.
  const data = [
    ...items.map((item) => ({
      kind: "INDENT" as const,
      id: item.id,
      materialName: item.materialName,
      unit: item.unit,
      serviceType: null as string | null,
      quantity: item.quantity,
      link: null as string | null,
      rate:
        item.finalUnitPrice ??
        (item.approvedQuote ? Number(item.approvedQuote.unitPrice) : null) ??
        item.estimatedUnitPrice ??
        null,
      indentId: item.indent.id,
      indentRef: item.indent.indentId,
      indentName: item.indent.name,
      projectName: item.indent.project?.name ?? null,
      date: item.indent.finalApprovedAt,
    })),
    ...capabilities.map((cap) => ({
      kind: "CAPABILITY" as const,
      id: cap.id,
      materialName: cap.materialName,
      unit: cap.unit,
      serviceType: cap.serviceType as string | null,
      quantity: cap.quantity,
      rate: cap.rate,
      link: cap.link,
      indentId: null,
      indentRef: null,
      indentName: null,
      projectName: null,
      date: cap.createdAt,
    })),
  ].sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));

  return c.json({ success: true, data });
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
  if (!["PROCUREMENT", "ACCOUNTS"].includes(perms.workspaceRole) && !perms.isWorkspaceAdmin) {
    throw AppError.Forbidden("Insufficient permissions");
  }

  const capabilities = await prisma.vendorMaterialCapability.findMany({
    where: { vendorId, workspaceId },
    include: {
      material: {
        select: { id: true, materialId: true, name: true },
      },
    },
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
  // Agreed rate in paise, matching every other price in procurement.
  rate: z.number().int().positive().nullable().optional(),
  // Quantity the rate was agreed for; rate x quantity is the row total.
  quantity: z.number().int().positive().nullable().optional(),
  // Reference link — a photo, a quotation, a catalogue page. Restricted to
  // http(s) so nothing script-bearing can reach an anchor href.
  link: CapabilityLinkSchema,
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
    data.serviceType,
    { rate: data.rate, link: data.link, quantity: data.quantity }
  );

  return c.json({ success: true, data: capability }, 201);
});

/**
 * PATCH /api/v1/procurement/vendors/:id/capabilities/:capId
 * Edit a manually maintained supplier / contractor material.
 */
procurementVendors.patch(
  "/:id/capabilities/:capId",
  zValidator("json", UpdateCapabilitySchema),
  async (c) => {
    const user = c.get("user");
    const vendorId = c.req.param("id");
    const capabilityId = c.req.param("capId");
    const workspaceId = c.req.query("w");

    if (!workspaceId) throw AppError.ValidationError("Missing workspaceId (w)");
    await checkProcurementPerms(workspaceId, user.id);

    const capability = await VendorService.updateCapability(
      capabilityId,
      vendorId,
      workspaceId,
      c.req.valid("json")
    );

    return c.json({ success: true, data: capability });
  }
);

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

/**
 * PUT /api/v1/procurement/vendors/:id/quotation-mapping
 * Remembers how this vendor's quotation columns map onto indent fields, so the
 * next quotation in the same format imports without manual mapping. A null body
 * mapping forgets it again.
 */
procurementVendors.put(
  "/:id/quotation-mapping",
  zValidator("json", QuotationMappingSchema),
  async (c) => {
    const user = c.get("user");
    const vendorId = c.req.param("id");
    const workspaceId = c.req.query("w");

    if (!workspaceId) throw AppError.ValidationError("Missing workspaceId (w)");
    await checkProcurementPerms(workspaceId, user.id);

    // Scoped to the workspace so an id from elsewhere cannot be written to.
    const vendor = await prisma.vendor.findFirst({
      where: { id: vendorId, workspaceId },
      select: { id: true },
    });
    if (!vendor) throw AppError.NotFound("Supplier / contractor not found");

    const updated = await prisma.vendor.update({
      where: { id: vendor.id },
      data: { quotationMapping: c.req.valid("json").mapping ?? Prisma.DbNull },
      select: { id: true, quotationMapping: true },
    });

    return c.json({ success: true, data: updated });
  }
);

export default procurementVendors;
