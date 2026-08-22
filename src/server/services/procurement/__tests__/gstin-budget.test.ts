import { describe, expect, it, vi, beforeEach } from "vitest";

const gstinLookupUsage = { findUnique: vi.fn(), upsert: vi.fn() };

vi.mock("@/lib/db", () => ({ default: { gstinLookupUsage } }));
vi.mock("@/lib/env", () => ({ env: { GSTIN_API_KEY: "gak_test" } }));

const { lookupGstin } = await import("../gstin/gstin-api.service");

const providerBody = (gstin: string) => ({
  success: true,
  credits_remaining: 40,
  data: {
    gstin,
    legal_name: "EXAMPLE PRIVATE LIMITED",
    trade_name: null,
    status: "Active",
    taxpayer_type: "Regular",
    state_code: gstin.slice(0, 2),
  },
});

const respondWith = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

/**
 * The provider's free allowance is 100 a month; stopping at 75 is what keeps a
 * busy onboarding day from quietly spending paid credits.
 */
describe("GSTIN monthly lookup budget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gstinLookupUsage.findUnique.mockResolvedValue({ count: 0 });
  });

  it("looks up and counts the credit while under budget", async () => {
    const gstin = "27AAPFU0939F1ZV";
    vi.stubGlobal("fetch", respondWith(providerBody(gstin)));

    const result = await lookupGstin(gstin);

    expect(result.data.legal_name).toBe("EXAMPLE PRIVATE LIMITED");
    expect(gstinLookupUsage.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { count: { increment: 1 } } })
    );
  });

  it("refuses at the limit and tells the user to enter details manually", async () => {
    const fetchMock = respondWith(providerBody("33AAACC1206D1ZN"));
    vi.stubGlobal("fetch", fetchMock);
    gstinLookupUsage.findUnique.mockResolvedValue({ count: 75 });

    await expect(lookupGstin("33AAACC1206D1ZN")).rejects.toThrow(
      "limit of 75 GSTIN verifications has been reached. Please enter this vendor's details manually."
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not count a lookup the provider rejected", async () => {
    vi.stubGlobal("fetch", respondWith({ success: false, error: "not found" }, 404));

    await expect(lookupGstin("24ABCDE1234F1Z6")).rejects.toThrow("not found in the GST registry");
    expect(gstinLookupUsage.upsert).not.toHaveBeenCalled();
  });

  it("never reaches the provider for a GSTIN that fails its checksum", async () => {
    const fetchMock = respondWith(providerBody("27AAPFU0939F1ZX"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(lookupGstin("27AAPFU0939F1ZX")).rejects.toThrow("checksum");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(gstinLookupUsage.findUnique).not.toHaveBeenCalled();
  });
});
