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
});
