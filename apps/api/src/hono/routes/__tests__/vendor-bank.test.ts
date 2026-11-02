import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { resolveCapabilities } from "@tusker/core/lib/constants/capabilities";

const vendorRow = {
  id: "ven-1",
  name: "Sharma Carpentry",
  verificationStatus: "PENDING",
  bankAccountName: "Sharma Carpentry",
  bankAccountNumber: "50100123456789",
  bankIfsc: "HDFC0001234",
  bankName: "HDFC Bank",
  bankBranch: "Andheri",
};

const vendor = { findMany: vi.fn(async () => [vendorRow]), findFirst: vi.fn(async () => vendorRow) };
vi.mock("@tusker/db", () => ({ default: { vendor } }));

const setVerification = vi.fn(async () => ({ ...vendorRow, verificationStatus: "VERIFIED" }));
vi.mock("@tusker/core/server/services/procurement", () => ({
  VendorService: { setVerification },
  lookupGstin: vi.fn(),
}));

let role = "MEMBER";
vi.mock("@tusker/core/permissions", () => ({
  fetchWorkspacePermissions: vi.fn(async () => ({
    workspaceMemberId: "member-1",
    workspaceRole: role,
    isWorkspaceAdmin: role === "ADMIN" || role === "OWNER",
    capabilities: resolveCapabilities(role as any),
  })),
}));

const procurementVendors = (await import("../procurement-vendors")).default;
const app = new Hono<{ Variables: { user: { id: string } } }>();
app.use("*", async (c, next) => {
  c.set("user", { id: "u1" });
  await next();
});
(app as any).route("/", procurementVendors);
app.onError((err: any) => new Response(err.message, { status: err.statusCode ?? 500 }));

describe("vendor bank details and verification", () => {
  it("hides bank details from members without vendors:bank, on list and detail", async () => {
    role = "PROCUREMENT";
    const list = await (await app.request("/?w=ws-1")).json();
    const one = await (await app.request("/ven-1?w=ws-1")).json();
    for (const v of [list.data[0], one.data]) {
      expect(v.name).toBe("Sharma Carpentry");
      expect(v.verificationStatus).toBe("PENDING");
      expect(v.bankAccountNumber).toBeUndefined();
      expect(v.bankIfsc).toBeUndefined();
    }
  });

  it("shows bank details to owners and admins", async () => {
    role = "ADMIN";
    const one = await (await app.request("/ven-1?w=ws-1")).json();
    expect(one.data.bankAccountNumber).toBe("50100123456789");
  });

  it("only vendors:verify holders can mark a vendor verified", async () => {
    const verify = () =>
      app.request("/ven-1/verification?w=ws-1", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "VERIFIED" }),
      });

    role = "PROCUREMENT";
    expect((await verify()).status).toBe(403);
    expect(setVerification).not.toHaveBeenCalled();

    role = "OWNER";
    const res = await verify();
    expect(res.status).toBe(200);
    expect(setVerification).toHaveBeenCalledWith("ven-1", "ws-1", "VERIFIED", "member-1");
  });
});
