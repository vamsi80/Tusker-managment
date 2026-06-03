import { getDb } from "@/lib/registry";
import { AppError } from "@/lib/errors/app-error";

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
  }) {
    if (data.gstNumber) {
      const existing = await getDb().vendor.findFirst({
        where: { workspaceId: data.workspaceId, gstNumber: data.gstNumber },
      });
      if (existing) throw AppError.Conflict("Vendor with this GST number already exists in this workspace");
    }

    return getDb().vendor.create({
      data: {
        ...data,
        status: "ACTIVE",
        isActive: true,
      },
    });
  }

  static async blacklistVendor(vendorId: string, workspaceId: string) {
    const vendor = await getDb().vendor.findFirst({
      where: { id: vendorId, workspaceId },
    });
    if (!vendor) throw AppError.NotFound("Vendor not found");

    return getDb().vendor.update({
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
    const vendor = await getDb().vendor.findFirst({
      where: { id: vendorId, workspaceId },
    });
    if (!vendor) throw AppError.NotFound("Vendor not found");

    const resolvedServiceType = serviceType || "SUPPLY";

    // Upsert capability + sync to MaterialCatalog in one transaction
    return getDb().$transaction(async (tx) => {
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
        },
        create: {
          vendorId,
          materialName: normalized,
          unit: unit || null,
          workspaceId,
          source: "MANUAL",
          serviceType: resolvedServiceType,
        },
      });

      // Keep MaterialCatalog in sync
      await tx.materialCatalog.upsert({
        where: {
          workspaceId_name: { workspaceId, name: normalized },
        },
        create: {
          workspaceId,
          name: normalized,
          unit: unit?.trim() || null,
          source: "VENDOR",
        },
        update: {
          // Only update unit if we have one (don't overwrite with null)
          ...(unit ? { unit: unit.trim() } : {}),
        },
      });

      return capability;
    });
  }

  static async removeCapability(capabilityId: string, workspaceId: string) {
    const cap = await getDb().vendorMaterialCapability.findFirst({
      where: { id: capabilityId, workspaceId },
    });
    if (!cap) throw AppError.NotFound("Capability not found");

    await getDb().vendorMaterialCapability.delete({
      where: { id: capabilityId },
    });
  }
}
