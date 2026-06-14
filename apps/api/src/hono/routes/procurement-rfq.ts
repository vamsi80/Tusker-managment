import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { HonoVariables } from "../types";
import { AppError } from "@tusker/shared/errors";
import { RFQService } from "@/server/services/procurement";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";
import { getDb } from "@/lib/registry";
import { SendRfqSchema, SubmitQuoteSchema, RejectQuoteSchema } from "@/hono/schemas";

const procurementRfq = new Hono<{ Variables: HonoVariables }>();

/**
 * GET /api/v1/procurement/rfq/items/:lineItemId/quotes
 * Get all quotes for a specific line item
 */
procurementRfq.get("/items/:lineItemId/quotes", async (c) => {
  const lineItemId = c.req.param("lineItemId");
  const workspaceId = c.req.query("w");
  if (!workspaceId) throw AppError.ValidationError("Missing workspaceId (w)");

  const user = c.get("user");
  const perms = await getWorkspacePermissions(workspaceId, user.id);
  if (!perms) throw AppError.Forbidden("Not a workspace member");

  const quotes = await getDb().vendorQuote.findMany({
    where: {
      lineItemId,
      lineItem: { indent: { workspaceId } },
    },
    include: {
      vendor: {
        select: {
          id: true,
          name: true,
          companyName: true,
          email: true,
          phoneNumber: true,
        },
      },
      reviewedBy: {
        include: {
          user: { select: { id: true, name: true, surname: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return c.json({ success: true, data: quotes });
});

/**
 * GET /api/v1/procurement/rfq/items/:lineItemId/suggested-vendors
 * Alias: same as indents route but accessed from rfq context
 * Returns suggested vendors + supplied-before flag
 */
procurementRfq.get("/items/:lineItemId/suggested-vendors", async (c) => {
  const lineItemId = c.req.param("lineItemId");
  const workspaceId = c.req.query("w");
  if (!workspaceId) throw AppError.ValidationError("Missing workspaceId (w)");

  const user = c.get("user");
  const perms = await getWorkspacePermissions(workspaceId, user.id);
  if (!perms) throw AppError.Forbidden("Not a workspace member");

  const lineItem = await getDb().indentLineItem.findUnique({
    where: { id: lineItemId },
    include: { indent: true },
  });
  if (!lineItem) throw AppError.NotFound("Line item not found");
  if (lineItem.indent.workspaceId !== workspaceId) throw AppError.Forbidden("Not allowed");

  // Trigram similarity search
  const normalized = lineItem.materialName.toLowerCase().trim();
  const rawSuggestions = await getDb().$queryRaw<
    { vendorId: string; similarity: number; materialName: string }[]
  >`
    SELECT vmc."vendorId", vmc."materialName",
           similarity(vmc."materialName", ${normalized}) AS similarity
    FROM   vendor_material_capability vmc
    JOIN   vendor v ON v.id = vmc."vendorId"
    WHERE  vmc."workspaceId" = ${workspaceId}
      AND  v."isActive" = true
      AND  v."status" != 'BLACKLISTED'
      AND  similarity(vmc."materialName", ${normalized}) > 0.3
    ORDER BY similarity DESC
    LIMIT 10
  `;

  if (rawSuggestions.length === 0) {
    return c.json({ success: true, data: [] });
  }

  const vendorIds = rawSuggestions.map((s) => s.vendorId);
  const vendors = await getDb().vendor.findMany({
    where: { id: { in: vendorIds } },
    include: {
      quotes: { select: { status: true } },
      capabilities: {
        where: { materialName: normalized },
        select: { id: true, source: true },
      },
    },
  });

  const enriched = rawSuggestions.map((s) => {
    const vendor = vendors.find((v) => v.id === s.vendorId)!;
    if (!vendor) return null;
    const totalQuotes = vendor.quotes.length;
    const approvedQuotes = vendor.quotes.filter((q) => q.status === "APPROVED").length;
    const performanceScore = totalQuotes > 0 ? Math.round((approvedQuotes / totalQuotes) * 100) : null;
    const hasSuppliedBefore = vendor.capabilities.length > 0;

    return {
      vendor: {
        id: vendor.id,
        name: vendor.name,
        companyName: vendor.companyName,
        email: vendor.email,
        phoneNumber: vendor.phoneNumber,
      },
      similarityScore: Number(s.similarity),
      capabilityMatchedOn: s.materialName,
      hasSuppliedBefore,
      performanceScore,
      totalQuotes,
    };
  }).filter(Boolean);

  return c.json({ success: true, data: enriched });
});

/**
 * POST /api/v1/procurement/rfq/send
 * Send RFQ to one or more vendors for a specific line item
 */
procurementRfq.post("/send", zValidator("json", SendRfqSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");
  const workspaceId = c.req.query("w");
  if (!workspaceId) throw AppError.ValidationError("Missing workspaceId (w)");

  const perms = await getWorkspacePermissions(workspaceId, user.id);
  const allowedRoles = ["OWNER", "ADMIN", "MANAGER", "PROCUREMENT"];
  if (!perms || !allowedRoles.includes(perms.workspaceRole!)) {
    throw AppError.Forbidden("Insufficient permissions to send RFQ");
  }

  await RFQService.sendRFQ(
    body.lineItemId,
    body.vendorIds,
    new Date(body.deadline),
    user.id,
    workspaceId
  );

  // Fetch updated line item
  const updated = await getDb().indentLineItem.findUnique({
    where: { id: body.lineItemId },
  });

  return c.json({ success: true, data: updated });
});

/**
 * POST /api/v1/procurement/rfq/quotes
 * Submit a vendor quote for a line item
 */
procurementRfq.post("/quotes", zValidator("json", SubmitQuoteSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");
  const workspaceId = c.req.query("w");
  if (!workspaceId) throw AppError.ValidationError("Missing workspaceId (w)");

  const quote = await RFQService.submitQuote(
    {
      lineItemId: body.lineItemId,
      vendorId: body.vendorId,
      unitPrice: body.unitPrice,
      quantity: body.quantity,
      leadTimeDays: body.leadTimeDays,
      validUntil: body.validUntil ? new Date(body.validUntil) : undefined,
      notes: body.notes,
      attachmentUrl: body.attachmentUrl,
    },
    workspaceId
  );

  return c.json({ success: true, data: quote }, 201);
});

/**
 * POST /api/v1/procurement/rfq/quotes/:id/approve
 * Approve a vendor quote (auto-rejects others, auto-upserts capability)
 */
procurementRfq.post("/quotes/:id/approve", async (c) => {
  const user = c.get("user");
  const quoteId = c.req.param("id");
  const workspaceId = c.req.query("w");
  if (!workspaceId) throw AppError.ValidationError("Missing workspaceId (w)");

  await RFQService.approveQuote(quoteId, user.id, workspaceId);

  // Return updated quotes list for the line item
  const updatedQuote = await getDb().vendorQuote.findUnique({
    where: { id: quoteId },
    include: { vendor: { select: { id: true, name: true, companyName: true } } },
  });

  return c.json({ success: true, data: updatedQuote });
});

/**
 * POST /api/v1/procurement/rfq/quotes/:id/reject
 * Reject a vendor quote with a reason
 */
procurementRfq.post("/quotes/:id/reject", zValidator("json", RejectQuoteSchema), async (c) => {
  const user = c.get("user");
  const quoteId = c.req.param("id");
  const workspaceId = c.req.query("w");
  const { reason } = c.req.valid("json");
  if (!workspaceId) throw AppError.ValidationError("Missing workspaceId (w)");

  const updated = await RFQService.rejectQuote(quoteId, reason, user.id, workspaceId);
  return c.json({ success: true, data: updated });
});

export default procurementRfq;
