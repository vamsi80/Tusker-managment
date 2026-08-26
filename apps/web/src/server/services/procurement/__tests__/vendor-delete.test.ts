import { describe, expect, it, vi, beforeEach } from "vitest";

const vendor = { findFirst: vi.fn(), delete: vi.fn() };
const vendorQuote = { count: vi.fn() };
const indent = { count: vi.fn() };

vi.mock("@/lib/db", () => ({ default: { vendor, vendorQuote, indent } }));

const { VendorService } = await import("../vendor/vendor.service");

/**
 * VendorQuote cascades on vendor delete and an awarded indent is unlinked, so
 * the guard is the only thing standing between a stray click and lost history.
 */
describe("VendorService.deleteVendor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vendor.findFirst.mockResolvedValue({ id: "v1", name: "Mahadev Steel" });
    vendorQuote.count.mockResolvedValue(0);
    indent.count.mockResolvedValue(0);
  });

  it("deletes a vendor with no procurement history", async () => {
    await VendorService.deleteVendor("v1", "w1");
    expect(vendor.delete).toHaveBeenCalledWith({ where: { id: "v1" } });
  });

  it("refuses a vendor holding quotations, naming the count", async () => {
    vendorQuote.count.mockResolvedValue(2);

    await expect(VendorService.deleteVendor("v1", "w1")).rejects.toThrow(
      "Mahadev Steel has 2 quotations on record"
    );
    expect(vendor.delete).not.toHaveBeenCalled();
  });

  it("refuses a vendor awarded an indent, singular", async () => {
    indent.count.mockResolvedValue(1);

    await expect(VendorService.deleteVendor("v1", "w1")).rejects.toThrow(
      "has 1 awarded indent on record"
    );
  });

  it("lists both reasons together", async () => {
    vendorQuote.count.mockResolvedValue(1);
    indent.count.mockResolvedValue(3);

    await expect(VendorService.deleteVendor("v1", "w1")).rejects.toThrow(
      "has 1 quotation and 3 awarded indents on record"
    );
  });

  it("rejects a vendor from another workspace", async () => {
    vendor.findFirst.mockResolvedValue(null);

    await expect(VendorService.deleteVendor("v1", "w1")).rejects.toThrow("Supplier / contractor not found");
    expect(vendor.delete).not.toHaveBeenCalled();
  });
});
