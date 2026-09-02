import { beforeEach, describe, expect, test, vi } from "vitest";

const dbMocks = vi.hoisted(() => {
  const tx = {
    poSequence: { upsert: vi.fn() },
    purchaseOrder: { create: vi.fn() },
  };
  return {
    workspaceMember: { findUnique: vi.fn() },
    vendor: { findFirst: vi.fn() },
    indent: { findFirst: vi.fn() },
    $transaction: vi.fn(async (callback: any) => callback(tx)),
    tx,
  };
});

vi.mock("@/lib/db", () => ({ default: dbMocks }));

import { PurchaseOrderService, type CreatePurchaseOrderInput } from "../po/po.service";

const input = (): CreatePurchaseOrderInput => ({
  workspaceId: "workspace-1",
  company: "WT",
  vendorId: "vendor-1",
  indentId: "indent-1",
  deliveryAddress: "Site address",
  items: [
    {
      description: "Cement",
      unit: "bag",
      quantity: 10,
      rate: 40_000,
      taxPercent: 18,
    },
  ],
});

describe("PurchaseOrderService indent gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.workspaceMember.findUnique.mockResolvedValue({ id: "member-1" });
    dbMocks.vendor.findFirst.mockResolvedValue({ id: "vendor-1", gstNumber: "29ABCDE1234F1Z5" });
  });

  test("rejects a PO for an indent that is not approved", async () => {
    dbMocks.indent.findFirst.mockResolvedValue({ id: "indent-1", status: "SUBMITTED" });

    await expect(
      PurchaseOrderService.create(input(), "user-1")
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(dbMocks.$transaction).not.toHaveBeenCalled();
  });

  test("creates a PO when the indent is approved", async () => {
    dbMocks.indent.findFirst.mockResolvedValue({ id: "indent-1", status: "APPROVED" });
    dbMocks.tx.poSequence.upsert.mockResolvedValue({ next: 65 });
    dbMocks.tx.purchaseOrder.create.mockResolvedValue({ id: "po-1", poNumber: "WT/26-27/0064" });

    const po = await PurchaseOrderService.create(input(), "user-1");

    expect(dbMocks.tx.purchaseOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ indentId: "indent-1", vendorId: "vendor-1" }),
      })
    );
    expect(po).toEqual(expect.objectContaining({ id: "po-1" }));
  });
});
