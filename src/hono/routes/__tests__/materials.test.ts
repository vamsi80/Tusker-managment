import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const materialCatalog = { findMany: vi.fn(), findUniqueOrThrow: vi.fn() };
const indentLineItem = { findMany: vi.fn() };
const vendorMaterialCapability = { findMany: vi.fn() };

vi.mock("@/lib/db", () => ({
  default: {
    materialCatalog,
    indentLineItem,
    vendorMaterialCapability,
  },
}));

vi.mock("@/data/user/get-user-permissions", () => ({
  getWorkspacePermissions: vi.fn(async () => ({ hasAccess: true, workspaceRole: "PROCUREMENT" })),
}));

const materialsRoute = (await import("../materials")).default;

const app = new Hono<{ Variables: { user: { id: string } } }>();
app.use("*", async (c, next) => {
  c.set("user", { id: "u1" });
  await next();
});
(app as any).route("/", materialsRoute);
app.onError((err: any) => new Response(err.message, { status: err.statusCode ?? 500 }));

describe("GET /api/v1/materials", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns materials with latest price and offering vendor (finalUnitPrice > capability > estimate)", async () => {
    materialCatalog.findMany.mockResolvedValue([
      {
        id: "mat-1",
        materialId: "MAT-001",
        name: "OPC 53 Cement",
        unit: "bag",
        defaultUnit: { abbreviation: "bag", name: "Bags" },
      },
      {
        id: "mat-2",
        materialId: "MAT-002",
        name: "River Sand",
        unit: "cft",
        defaultUnit: null,
      },
    ]);

    indentLineItem.findMany.mockResolvedValue([
      {
        materialName: "OPC 53 Cement",
        finalUnitPrice: 42000,
        estimatedUnitPrice: 45000,
        updatedAt: new Date("2026-08-10"),
        indent: { selectedVendor: { id: "ven-1", name: "UltraTech Supply", companyName: "UltraTech Ltd" } },
        approvedQuote: null,
      },
    ]);

    vendorMaterialCapability.findMany.mockResolvedValue([
      {
        materialName: "River Sand",
        rate: 5500,
        vendor: { id: "ven-2", name: "Local Sand Suppliers", companyName: "Sand Co" },
      },
    ]);

    const res = await app.request("/?w=ws-1");
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toEqual([
      {
        id: "mat-1",
        materialId: "MAT-001",
        name: "OPC 53 Cement",
        lastPrice: 42000,
        vendor: { id: "ven-1", name: "UltraTech Supply", companyName: "UltraTech Ltd" },
        defaultUnit: { abbreviation: "bag", name: "Bags" },
      },
      {
        id: "mat-2",
        materialId: "MAT-002",
        name: "River Sand",
        lastPrice: 5500,
        vendor: { id: "ven-2", name: "Local Sand Suppliers", companyName: "Sand Co" },
        defaultUnit: { abbreviation: "cft" },
      },
    ]);
  });
});
