import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const indentLineItem = { findMany: vi.fn() };
const vendorMaterialCapability = { findMany: vi.fn() };

vi.mock("@/lib/db", () => ({ default: { indentLineItem, vendorMaterialCapability } }));
const addManualCapability = vi.fn(async () => ({ id: "cap-1" }));
vi.mock("@/server/services/procurement", () => ({ VendorService: { addManualCapability }, lookupGstin: vi.fn() }));
vi.mock("@/data/user/get-user-permissions", () => ({
  getWorkspacePermissions: vi.fn(async () => ({ hasAccess: true, workspaceRole: "PROCUREMENT" })),
}));

const procurementVendors = (await import("../procurement-vendors")).default;

const app = new Hono<{ Variables: { user: { id: string } } }>();
app.use("*", async (c, next) => {
  c.set("user", { id: "u1" });
  await next();
});
(app as any).route("/", procurementVendors);
// Mirrors the real app's handler, so a rejected body answers 400 rather than 500.
app.onError((err: any) => new Response(err.message, { status: err.statusCode ?? 500 }));

const addMaterial = (body: any) =>
  app.request("/ven-1/capabilities?w=ws-1", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ materialName: "river sand", ...body }),
  });

const row = (overrides: any) => ({
  id: "li-1",
  materialName: "cement",
  unit: "bag",
  quantity: 10,
  finalUnitPrice: null,
  estimatedUnitPrice: null,
  approvedQuote: null,
  indent: {
    id: "ind-1",
    indentId: "IND-001",
    name: "Slab pour",
    finalApprovedAt: new Date("2026-08-01"),
    project: { name: "Tower A" },
  },
  ...overrides,
});

/**
 * The rate a vendor was actually awarded lives in one of three columns, all in
 * paise. Picking the wrong one shows a stale price at the next negotiation.
 */
describe("GET /vendors/:id/materials", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vendorMaterialCapability.findMany.mockResolvedValue([]);
  });

  it("prefers the final rate, then the approved quote, then the estimate", async () => {
    indentLineItem.findMany.mockResolvedValue([
      row({ id: "a", finalUnitPrice: 45000, approvedQuote: { unitPrice: "39000" }, estimatedUnitPrice: 50000 }),
      row({ id: "b", approvedQuote: { unitPrice: "39000" }, estimatedUnitPrice: 50000 }),
      row({ id: "c", estimatedUnitPrice: 50000 }),
      row({ id: "d" }),
    ]);

    const res = await app.request("/ven-1/materials?w=ws-1");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.map((item: any) => item.rate)).toEqual([45000, 39000, 50000, null]);
    expect(body.data[0]).toMatchObject({ materialName: "cement", indentRef: "IND-001", projectName: "Tower A" });
  });

  it("lists a hand-added material with its agreed rate and no indent", async () => {
    indentLineItem.findMany.mockResolvedValue([]);
    vendorMaterialCapability.findMany.mockResolvedValue([
      {
        id: "cap-1",
        materialName: "river sand",
        unit: "cft",
        serviceType: "SUPPLY",
        rate: 4500,
        createdAt: new Date("2026-08-05"),
      },
    ]);

    const body = await (await app.request("/ven-1/materials?w=ws-1")).json();

    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      kind: "CAPABILITY",
      materialName: "river sand",
      rate: 4500,
      quantity: null,
      indentRef: null,
    });
  });

  it("only counts approved indents this vendor won, by award or by quote", async () => {
    indentLineItem.findMany.mockResolvedValue([]);

    await app.request("/ven-1/materials?w=ws-1");

    expect(indentLineItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          indent: { workspaceId: "ws-1", status: "APPROVED" },
          OR: [{ indent: { selectedVendorId: "ven-1" } }, { approvedQuote: { vendorId: "ven-1" } }],
        },
      })
    );
  });

  /**
   * The link lands in an anchor href, so anything but http(s) — javascript:,
   * data: — has to be refused at the boundary rather than on render.
   */
  it("stores an http(s) link and refuses any other scheme", async () => {
    expect((await addMaterial({ link: "https://drive.example.com/tv.jpg" })).status).toBe(201);
    expect(addManualCapability).toHaveBeenCalledWith(
      "ven-1",
      "ws-1",
      "river sand",
      undefined,
      "SUPPLY",
      { rate: undefined, link: "https://drive.example.com/tv.jpg" }
    );

    addManualCapability.mockClear();
    expect((await addMaterial({ link: "javascript:alert(1)" })).status).toBe(400);
    expect((await addMaterial({ link: "not a url" })).status).toBe(400);
    expect(addManualCapability).not.toHaveBeenCalled();
  });
});
