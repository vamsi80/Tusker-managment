import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const indentLineItem = { findMany: vi.fn() };
const vendorMaterialCapability = { findMany: vi.fn() };

vi.mock("@/lib/db", () => ({ default: { indentLineItem, vendorMaterialCapability } }));
vi.mock("@/server/services/procurement", () => ({ VendorService: {}, lookupGstin: vi.fn() }));
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
});
