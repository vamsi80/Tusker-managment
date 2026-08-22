import "server-only";
import prisma from "@/lib/db";
import { AppError } from "@/lib/errors/app-error";
import { ensureMaterialCatalog } from "../material-catalog.service";
import { nextVendorId } from "../procurement-entity-id";

export class VendorService {
  
  static async createVendor(data: {
    workspaceId: string;
    name: string;
    companyName?: string;
    contactPerson?: string;
    email?: string;
    address?: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    state?: string;
    pincode?: string;
    country?: string;
    gstNumber?: string;
    phoneNumber?: string;
    gstStatus?: string | null;
    taxpayerType?: string | null;
    businessConstitution?: string | null;
    gstRegistrationDate?: string | null;
    gstCancellationDate?: string | null;
    stateJurisdiction?: string | null;
    natureOfBusiness?: string | null;
    blockStatus?: string | null;
    einvoiceStatus?: string | null;
  }) {
    if (data.gstNumber) {
      const existing = await prisma.vendor.findFirst({
        where: { workspaceId: data.workspaceId, gstNumber: data.gstNumber },
      });
      if (existing) throw AppError.Conflict("Vendor with this GST number already exists in this workspace");
    }

    return prisma.$transaction(async (tx) => {
      return tx.vendor.create({
        data: {
          ...data,
          vendorId: await nextVendorId(tx, data.workspaceId),
          status: "ACTIVE",
          isActive: true,
        },
      });
    });
  }

  /**
   * Hard delete, for a vendor added by mistake. VendorQuote cascades on vendor
   * delete and an awarded indent would be quietly unlinked, so anyone with
   * procurement history behind them is refused — blacklisting keeps the record.
   * Capabilities cascade away, which is fine: they are derived tags.
   */
  static async deleteVendor(vendorId: string, workspaceId: string) {
    const vendor = await prisma.vendor.findFirst({
      where: { id: vendorId, workspaceId },
    });
    if (!vendor) throw AppError.NotFound("Vendor not found");

    const [quotes, indents] = await Promise.all([
      prisma.vendorQuote.count({ where: { vendorId } }),
      prisma.indent.count({ where: { selectedVendorId: vendorId } }),
    ]);

    const blockers = [
      quotes > 0 ? `${quotes} quotation${quotes === 1 ? "" : "s"}` : null,
      indents > 0 ? `${indents} awarded indent${indents === 1 ? "" : "s"}` : null,
    ].filter(Boolean).join(" and ");

    if (blockers) {
      throw AppError.Conflict(
        `${vendor.name} has ${blockers} on record. Blacklist this vendor instead so the history stays intact.`
      );
    }

    return prisma.vendor.delete({ where: { id: vendorId } });
  }

  static async blacklistVendor(vendorId: string, workspaceId: string) {
    const vendor = await prisma.vendor.findFirst({
      where: { id: vendorId, workspaceId },
    });
    if (!vendor) throw AppError.NotFound("Vendor not found");

    return prisma.vendor.update({
      where: { id: vendorId },
      data: { status: "BLACKLISTED" },
    });
  }

  static async addManualCapability(
    vendorId: string,
    workspaceId: string,
    materialName: string,
    unit?: string,
    serviceType?: "SUPPLY" | "LABOUR" | "LABOUR_WITH_MATERIAL"
  ) {
    const normalized = materialName.toLowerCase().trim();
    const vendor = await prisma.vendor.findFirst({
      where: { id: vendorId, workspaceId },
    });
    if (!vendor) throw AppError.NotFound("Vendor not found");

    const resolvedServiceType = serviceType || "SUPPLY";

    // Upsert capability + sync to MaterialCatalog in one transaction
    return prisma.$transaction(async (tx) => {
      const material = await ensureMaterialCatalog(tx, {
        workspaceId,
        name: normalized,
        unit,
        source: "VENDOR",
      });

      const capability = await tx.vendorMaterialCapability.upsert({
        where: {
          vendorId_materialName_serviceType: {
            vendorId,
            materialName: normalized,
            serviceType: resolvedServiceType,
          },
        },
        update: {
          unit: unit || null,
          materialCatalogId: material.id,
        },
        create: {
          vendorId,
          materialCatalogId: material.id,
          materialName: normalized,
          unit: unit || null,
          workspaceId,
          source: "MANUAL",
          serviceType: resolvedServiceType,
        },
        include: {
          material: {
            select: { id: true, materialId: true, name: true },
          },
        },
      });

      return capability;
    });
  }

  static async removeCapability(capabilityId: string, workspaceId: string) {
    const cap = await prisma.vendorMaterialCapability.findFirst({
      where: { id: capabilityId, workspaceId },
    });
    if (!cap) throw AppError.NotFound("Capability not found");

    await prisma.vendorMaterialCapability.delete({
      where: { id: capabilityId },
    });
  }
}
