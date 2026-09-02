import { beforeEach, describe, expect, test, vi } from "vitest";

const dbMocks = vi.hoisted(() => {
  const db: any = {
    materialCatalog: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    vendorMaterialCapability: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    unitOfMeasure: { findFirst: vi.fn() },
    $transaction: vi.fn(async (callback: (tx: any) => Promise<unknown>) => callback(db)),
  };
  return db;
});

vi.mock("@/lib/db", () => ({ default: dbMocks }));
vi.mock("../procurement-entity-id", () => ({ nextMaterialId: vi.fn() }));

import { updateMaterialCatalog } from "../material-catalog.service";

describe("updateMaterialCatalog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.materialCatalog.findFirst
      .mockResolvedValueOnce({
        id: "material-1",
        materialId: "MAT-0001",
        workspaceId: "workspace-1",
        name: "River Sand",
        unit: "CFT",
        vendorCapabilities: [
          { id: "cap-1", vendorId: "vendor-1", serviceType: "SUPPLY" },
        ],
      })
      .mockResolvedValueOnce(null);
    dbMocks.vendorMaterialCapability.findFirst.mockResolvedValue(null);
    dbMocks.unitOfMeasure.findFirst.mockResolvedValue({ id: "unit-1", abbreviation: "TON" });
    dbMocks.materialCatalog.update.mockResolvedValue({
      id: "material-1",
      materialId: "MAT-0001",
      name: "M Sand",
      unit: "TON",
      defaultUnit: { id: "unit-1", abbreviation: "TON", name: "Tonne" },
    });
  });

  test("updates the master and synchronizes linked vendor search names", async () => {
    const updated = await updateMaterialCatalog("material-1", "workspace-1", {
      name: "M Sand",
      unit: "ton",
    });

    expect(dbMocks.materialCatalog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "material-1" },
        data: { name: "M Sand", unit: "TON", defaultUnitId: "unit-1" },
      })
    );
    expect(dbMocks.vendorMaterialCapability.updateMany).toHaveBeenCalledWith({
      where: { materialCatalogId: "material-1" },
      data: { materialName: "m sand" },
    });
    expect(updated).toMatchObject({ name: "M Sand", unit: "TON" });
  });

  test("rejects a duplicate master name", async () => {
    dbMocks.materialCatalog.findFirst
      .mockReset()
      .mockResolvedValueOnce({
        id: "material-1",
        name: "River Sand",
        unit: "CFT",
        vendorCapabilities: [],
      })
      .mockResolvedValueOnce({ id: "material-2" });

    await expect(
      updateMaterialCatalog("material-1", "workspace-1", { name: "Cement" })
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(dbMocks.materialCatalog.update).not.toHaveBeenCalled();
  });
});
