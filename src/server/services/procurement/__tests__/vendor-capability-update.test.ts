import { beforeEach, describe, expect, test, vi } from "vitest";

const dbMocks = vi.hoisted(() => {
  const db: any = {
    vendorMaterialCapability: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    materialCatalog: { findFirst: vi.fn() },
    $transaction: vi.fn(async (callback: (tx: any) => Promise<unknown>) => callback(db)),
  };
  return db;
});

const ensureMaterialCatalog = vi.hoisted(() => vi.fn().mockResolvedValue({ id: "material-2" }));

vi.mock("@/lib/db", () => ({ default: dbMocks }));
vi.mock("../material-catalog.service", () => ({ ensureMaterialCatalog }));
vi.mock("../procurement-entity-id", () => ({ nextVendorId: vi.fn() }));

import { VendorService } from "../vendor/vendor.service";

describe("VendorService.updateCapability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.vendorMaterialCapability.findFirst
      .mockResolvedValueOnce({
        id: "cap-1",
        vendorId: "vendor-1",
        workspaceId: "workspace-1",
        materialName: "river sand",
        unit: "cft",
        serviceType: "SUPPLY",
      })
      .mockResolvedValueOnce(null);
    dbMocks.vendorMaterialCapability.update.mockImplementation(async ({ data }: any) => ({
      id: "cap-1",
      ...data,
    }));
    dbMocks.materialCatalog.findFirst.mockResolvedValue(null);
  });

  test("updates and relinks a supplier material to the master catalog", async () => {
    const updated = await VendorService.updateCapability(
      "cap-1",
      "vendor-1",
      "workspace-1",
      { materialName: "M Sand", unit: "ton", rate: 45000, quantity: 10 }
    );

    expect(ensureMaterialCatalog).toHaveBeenCalledWith(
      dbMocks,
      expect.objectContaining({ workspaceId: "workspace-1", name: "m sand", unit: "ton" })
    );
    expect(dbMocks.vendorMaterialCapability.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "cap-1" },
        data: expect.objectContaining({
          materialName: "m sand",
          materialCatalogId: "material-2",
          rate: 45000,
          quantity: 10,
        }),
      })
    );
    expect(updated).toMatchObject({ materialName: "m sand", materialCatalogId: "material-2" });
  });

  test("does not overwrite an existing master unit with a vendor-specific unit", async () => {
    dbMocks.materialCatalog.findFirst.mockResolvedValue({ id: "material-existing" });

    await VendorService.updateCapability("cap-1", "vendor-1", "workspace-1", {
      unit: "truck load",
    });

    expect(ensureMaterialCatalog).not.toHaveBeenCalled();
    expect(dbMocks.vendorMaterialCapability.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          materialCatalogId: "material-existing",
          unit: "truck load",
        }),
      })
    );
  });

  test("rejects an edit that would duplicate the vendor's material and service type", async () => {
    dbMocks.vendorMaterialCapability.findFirst
      .mockReset()
      .mockResolvedValueOnce({
        id: "cap-1",
        materialName: "river sand",
        unit: "cft",
        serviceType: "SUPPLY",
      })
      .mockResolvedValueOnce({ id: "cap-2" });

    await expect(
      VendorService.updateCapability("cap-1", "vendor-1", "workspace-1", {
        materialName: "cement",
      })
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(dbMocks.vendorMaterialCapability.update).not.toHaveBeenCalled();
  });
});
