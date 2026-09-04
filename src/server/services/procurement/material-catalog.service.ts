import { AppError } from "@/lib/errors/app-error";
import prisma from "@/lib/db";
import { nextMaterialId } from "./procurement-entity-id";

type EnsureMaterialCatalogInput = {
  workspaceId: string;
  name: string;
  unit?: string | null;
  source: "INDENT" | "PLANNING" | "VENDOR";
  defaultUnitId?: string | null;
  catalogId?: string;
};

/**
 * Returns a workspace material catalog row, creating it with a stable MAT ID
 * when needed. A supplied catalogId is always checked against the workspace.
 */
export async function ensureMaterialCatalog(tx: any, input: EnsureMaterialCatalogInput) {
  const name = input.name.trim();
  const unit = input.unit?.trim() || null;

  const existing = input.catalogId
    ? await tx.materialCatalog.findFirst({
        where: { id: input.catalogId, workspaceId: input.workspaceId },
      })
    : await tx.materialCatalog.findFirst({
        where: {
          workspaceId: input.workspaceId,
          name: { equals: name, mode: "insensitive" },
        },
      });

  if (input.catalogId && !existing) {
    throw AppError.ValidationError("Selected material does not belong to this workspace");
  }
  if (input.catalogId && existing.name.trim().toLowerCase() !== name.toLowerCase()) {
    throw AppError.ValidationError("Selected material does not match the material name");
  }

  if (existing) {
    return tx.materialCatalog.update({
      where: { id: existing.id },
      data: {
        ...(unit ? { unit } : {}),
        ...(input.defaultUnitId ? { defaultUnitId: input.defaultUnitId } : {}),
      },
    });
  }

  return tx.materialCatalog.create({
    data: {
      materialId: await nextMaterialId(tx, input.workspaceId),
      workspaceId: input.workspaceId,
      name,
      unit,
      source: input.source,
      defaultUnitId: input.defaultUnitId || null,
    },
  });
}

/**
 * Edit the workspace master record without rewriting transactional snapshots.
 * Linked vendor capability names follow the master name because vendor search
 * uses that denormalized field; indent and PO line-item descriptions do not.
 */
export async function updateMaterialCatalog(
  materialId: string,
  workspaceId: string,
  data: { name?: string; unit?: string | null }
) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.materialCatalog.findFirst({
      where: {
        workspaceId,
        OR: [{ id: materialId }, { materialId: materialId }],
      },
      include: {
        vendorCapabilities: {
          select: { id: true, vendorId: true, serviceType: true },
        },
      },
    });
    if (!current) throw AppError.NotFound("Material not found");

    const name = data.name === undefined ? current.name : data.name.trim();
    if (!name) throw AppError.ValidationError("Material name is required");

    const duplicate = await tx.materialCatalog.findFirst({
      where: {
        workspaceId,
        id: { not: current.id },
        name: { equals: name, mode: "insensitive" },
      },
      select: { id: true },
    });
    if (duplicate) throw AppError.Conflict("A material with this name already exists");

    if (data.name !== undefined && current.vendorCapabilities.length > 0) {
      const capabilityIds = current.vendorCapabilities.map((capability: any) => capability.id);
      const capabilityConflict = await tx.vendorMaterialCapability.findFirst({
        where: {
          workspaceId,
          id: { notIn: capabilityIds },
          materialName: { equals: name, mode: "insensitive" },
          OR: current.vendorCapabilities.map((capability: any) => ({
            vendorId: capability.vendorId,
            serviceType: capability.serviceType,
          })),
        },
        select: { id: true },
      });
      if (capabilityConflict) {
        throw AppError.Conflict(
          "A linked supplier / contractor already has a material with this name and service type"
        );
      }
    }

    let unitData: { unit?: string | null; defaultUnitId?: string | null } = {};
    if (data.unit !== undefined) {
      const unit = data.unit?.trim() || null;
      const defaultUnit = unit
        ? await tx.unitOfMeasure.findFirst({
            where: {
              workspaceId,
              abbreviation: { equals: unit, mode: "insensitive" },
            },
            select: { id: true, abbreviation: true },
          })
        : null;
      unitData = {
        unit: defaultUnit?.abbreviation ?? unit,
        defaultUnitId: defaultUnit?.id ?? null,
      };
    }

    const updated = await tx.materialCatalog.update({
      where: { id: current.id },
      data: {
        ...(data.name === undefined ? {} : { name }),
        ...unitData,
      },
      include: { defaultUnit: true },
    });

    if (data.name !== undefined && current.vendorCapabilities.length > 0) {
      await tx.vendorMaterialCapability.updateMany({
        where: { materialCatalogId: current.id },
        data: { materialName: name.toLowerCase() },
      });
    }

    return updated;
  });
}
