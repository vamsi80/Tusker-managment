import { AppError } from "@/lib/errors/app-error";
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
