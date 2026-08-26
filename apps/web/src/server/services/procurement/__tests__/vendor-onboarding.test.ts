import { beforeEach, describe, expect, test, vi } from "vitest";

const dbMocks = vi.hoisted(() => {
  const db: any = {
    vendor: {
      create: vi.fn(),
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(async (callback: (tx: any) => Promise<unknown>) => callback(db)),
  };
  return db;
});

const nextVendorId = vi.hoisted(() => vi.fn().mockResolvedValue("VEN-0001"));

vi.mock("@/lib/db", () => ({ default: dbMocks }));
vi.mock("../procurement-entity-id", () => ({ nextVendorId }));

import { VendorService } from "../vendor/vendor.service";

describe("Supplier / contractor onboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.vendor.create.mockImplementation(async ({ data }: any) => data);
  });

  test("allows onboarding with no profile fields", async () => {
    const created = await VendorService.createVendor({ workspaceId: "workspace-1" });

    expect(dbMocks.vendor.findFirst).not.toHaveBeenCalled();
    expect(dbMocks.vendor.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: "workspace-1",
        vendorId: "VEN-0001",
        name: "-",
        companyName: null,
        contactPerson: null,
        email: null,
        country: null,
        hasGst: false,
        gstNumber: null,
        gstStatus: null,
      }),
    });
    expect(created).toMatchObject({ name: "-", hasGst: false });
  });

  test("clears GST fields when GST registration is unchecked", async () => {
    await VendorService.createVendor({
      workspaceId: "workspace-1",
      hasGst: false,
      gstNumber: "27AAAAA0000A1Z5",
      gstStatus: "Active",
    });

    expect(dbMocks.vendor.findFirst).not.toHaveBeenCalled();
    expect(dbMocks.vendor.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        hasGst: false,
        gstNumber: null,
        gstStatus: null,
      }),
    });
  });

  test("keeps supplied GST information when registration is checked", async () => {
    dbMocks.vendor.findFirst.mockResolvedValue(null);

    await VendorService.createVendor({
      workspaceId: "workspace-1",
      hasGst: true,
      gstNumber: "27AAAAA0000A1Z5",
      gstStatus: "Active",
    });

    expect(dbMocks.vendor.findFirst).toHaveBeenCalledWith({
      where: { workspaceId: "workspace-1", gstNumber: "27AAAAA0000A1Z5" },
    });
    expect(dbMocks.vendor.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        hasGst: true,
        gstNumber: "27AAAAA0000A1Z5",
        gstStatus: "Active",
      }),
    });
  });
});
