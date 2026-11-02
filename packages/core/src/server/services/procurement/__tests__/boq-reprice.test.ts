import { describe, expect, test, vi } from "vitest";

vi.mock("@tusker/db", () => ({ default: {} }));

import { BoqService } from "../boq/boq.service";

const line = (over: Record<string, unknown>) => ({
  id: "line-1",
  boqId: "boq-1",
  description: "plywood 18mm",
  unit: "sqft",
  rate: 10_000,
  inputUnit: "ft",
  length: 4,
  breadth: 2,
  depth: null,
  quantity: 1,
  wastagePercent: 10,
  markupPercent: 25,
  capability: { materialName: "plywood 18mm", unit: "sqft", rate: 12_000 },
  ...over,
});

describe("BoqService.repriceCapabilities", () => {
  test("reprices only draft lines whose rate-sheet row changed, keeping wastage and markup", async () => {
    const db: any = {
      boqLineItem: {
        findMany: vi.fn(async () => [
          line({}),
          // already at today's rate: left alone
          line({ id: "line-2", boqId: "boq-2", rate: 12_000 }),
        ]),
        update: vi.fn(),
      },
      boq: { updateMany: vi.fn() },
    };

    expect(await BoqService.repriceCapabilities(db, ["cap-1"])).toBe(1);

    // Submitted / approved / superseded BOQs are never even read.
    expect(db.boqLineItem.findMany.mock.calls[0][0].where).toMatchObject({
      capabilityId: { in: ["cap-1"] },
      boq: { status: "DRAFT" },
    });
    // 8 sqft @ Rs 120 = 960, +10% wastage = 1056, +25% markup = 1320
    expect(db.boqLineItem.update).toHaveBeenCalledTimes(1);
    expect(db.boqLineItem.update).toHaveBeenCalledWith({
      where: { id: "line-1" },
      data: {
        description: "plywood 18mm",
        unit: "sqft",
        rate: 12_000,
        measuredQty: 8,
        costAmount: 105_600,
        amount: 132_000,
      },
    });
    expect(db.boq.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["boq-1"] } },
      data: { updatedAt: expect.any(Date) },
    });
  });

  test("does nothing without capability ids", async () => {
    const db: any = { boqLineItem: { findMany: vi.fn() } };
    expect(await BoqService.repriceCapabilities(db, [])).toBe(0);
    expect(db.boqLineItem.findMany).not.toHaveBeenCalled();
  });
});
