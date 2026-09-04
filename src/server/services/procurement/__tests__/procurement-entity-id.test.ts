import { describe, expect, test, vi } from "vitest";
import { nextMaterialId, nextVendorId } from "../procurement-entity-id";

const createTransaction = (vendorStart = 1, materialStart = 1) => {
  let nextVendorNumber = vendorStart;
  let nextMaterialNumber = materialStart;

  return {
    workspace: {
      update: vi.fn(async ({ data }: any) => {
        if (data.nextVendorNumber) {
          nextVendorNumber += data.nextVendorNumber.increment;
          return { nextVendorNumber };
        }

        nextMaterialNumber += data.nextMaterialNumber.increment;
        return { nextMaterialNumber };
      }),
    },
  };
};

describe("procurement entity IDs", () => {
  test("reserves sequential vendor IDs", async () => {
    const tx = createTransaction();

    await expect(nextVendorId(tx, "workspace-1")).resolves.toBe("VEN-0001");
    await expect(nextVendorId(tx, "workspace-1")).resolves.toBe("VEN-0002");
  });

  test("reserves an independent material sequence", async () => {
    const tx = createTransaction(7, 42);

    await expect(nextVendorId(tx, "workspace-1")).resolves.toBe("VEN-0007");
    await expect(nextMaterialId(tx, "workspace-1")).resolves.toBe("MAT-0042");
  });

  test("allows IDs to grow beyond four digits without truncation", async () => {
    const tx = createTransaction(10_000, 10_000);

    await expect(nextVendorId(tx, "workspace-1")).resolves.toBe("VEN-10000");
    await expect(nextMaterialId(tx, "workspace-1")).resolves.toBe("MAT-10000");
  });

  test("fills deleted material code gaps in ascending order", async () => {
    // Suppose workspace currently only has MAT-0009 and MAT-0012
    const existingMaterials = [{ materialId: "MAT-0009" }, { materialId: "MAT-0012" }];

    const txWithCatalog = {
      materialCatalog: {
        findMany: vi.fn(async () => existingMaterials),
      },
      workspace: {
        update: vi.fn(async () => ({})),
      },
    };

    // First new material should fill lowest gap: MAT-0001
    const first = await nextMaterialId(txWithCatalog, "w-1");
    expect(first).toBe("MAT-0001");

    // Simulate first material was added to database
    existingMaterials.push({ materialId: first });

    // Second new material should fill MAT-0002
    const second = await nextMaterialId(txWithCatalog, "w-1");
    expect(second).toBe("MAT-0002");
    existingMaterials.push({ materialId: second });

    // Add MAT-0003 through MAT-0008 to existing
    for (let i = 3; i <= 8; i++) {
      existingMaterials.push({ materialId: `MAT-${String(i).padStart(4, "0")}` });
    }

    // Next material should skip MAT-0009 (which exists) and fill MAT-0010
    const tenth = await nextMaterialId(txWithCatalog, "w-1");
    expect(tenth).toBe("MAT-0010");
    existingMaterials.push({ materialId: tenth });

    // Next fills MAT-0011
    const eleventh = await nextMaterialId(txWithCatalog, "w-1");
    expect(eleventh).toBe("MAT-0011");
    existingMaterials.push({ materialId: eleventh });

    // Next skips MAT-0012 (which exists) and generates MAT-0013
    const thirteenth = await nextMaterialId(txWithCatalog, "w-1");
    expect(thirteenth).toBe("MAT-0013");
  });
});
