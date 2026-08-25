import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@/hono/validator";
import { HonoVariables } from "../types";
import { AppError } from "@/lib/errors/app-error";
import { PurchaseOrderService } from "@/server/services/procurement";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";

const procurementPurchaseOrders = new Hono<{ Variables: HonoVariables }>();

const canReadProcurement = (perms: any) =>
  Boolean(
    perms?.hasAccess ||
      ["OWNER", "ADMIN", "MANAGER", "PROCUREMENT", "ACCOUNTS"].includes(perms?.workspaceRole)
  );

const requireWorkspace = async (workspaceId: string | undefined, userId: string) => {
  if (!workspaceId) throw AppError.ValidationError("Missing workspaceId (w)");
  const perms = await getWorkspacePermissions(workspaceId, userId);
  if (!canReadProcurement(perms)) throw AppError.Forbidden("Access denied to procurement");
  // Hand back the permissions too - raising a PO needs the caller's role, and
  // refetching them would mean a second round trip for the same rows.
  return { workspaceId, perms };
};

const CreatePurchaseOrderSchema = z.object({
  workspaceId: z.string().min(1),
  company: z.enum(["WT", "PL"]),
  vendorId: z.string().min(1),
  indentId: z.string().nullable().optional(),
  referenceNo: z.string().max(60).nullable().optional(),
  poDate: z.string().optional(),
  deliveryAddress: z.string().min(1).max(500),
  // Extras carried over from the indent: percentages of the subtotal, and flat
  // paise amounts for transport and labour.
  exciseDutyPercent: z.number().min(0).max(100).nullable().optional(),
  vatPercent: z.number().min(0).max(100).nullable().optional(),
  transportCharge: z.number().int().nonnegative().nullable().optional(),
  labourCharge: z.number().int().nonnegative().nullable().optional(),
  terms: z.array(z.string().min(1).max(500)).max(30).optional(),
  notes: z.string().max(1000).nullable().optional(),
  items: z
    .array(
      z.object({
        description: z.string().min(1).max(300),
        unit: z.string().min(1).max(20),
        quantity: z.number().int().positive(),
        // Paise, like indent line items.
        rate: z.number().int().nonnegative(),
        taxPercent: z.number().int().min(0).max(100),
      })
    )
    .min(1, "Add at least one line item"),
});

/** GET /api/v1/procurement/purchase-orders?w= */
procurementPurchaseOrders.get("/", async (c) => {
  const user = c.get("user");
  const { workspaceId } = await requireWorkspace(c.req.query("w"), user.id);
  return c.json({ success: true, data: await PurchaseOrderService.list(workspaceId) });
});

/** GET /api/v1/procurement/purchase-orders/:id?w= */
procurementPurchaseOrders.get("/:id", async (c) => {
  const user = c.get("user");
  const { workspaceId } = await requireWorkspace(c.req.query("w"), user.id);
  const po = await PurchaseOrderService.get(c.req.param("id"), workspaceId);
  return c.json({ success: true, data: po });
});

/** POST /api/v1/procurement/purchase-orders */
procurementPurchaseOrders.post("/", zValidator("json", CreatePurchaseOrderSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");

  const { perms } = await requireWorkspace(body.workspaceId, user.id);
  PurchaseOrderService.assertCanCreate(user.email, perms.workspaceRole);
  PurchaseOrderService.assertBuyerConfigured(body.company);

  const po = await PurchaseOrderService.create(
    { ...body, poDate: body.poDate ? new Date(body.poDate) : undefined },
    user.id
  );

  return c.json({ success: true, data: po }, 201);
});

export default procurementPurchaseOrders;
