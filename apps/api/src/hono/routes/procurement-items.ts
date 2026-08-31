import { Hono } from "hono";
import prisma from "@tusker/db";
import { LineItemStatus, QuoteStatus, IndentStatus } from "@tusker/db";
import { HonoVariables } from "../types";
import { fetchWorkspacePermissions } from "@tusker/core/permissions";

/**
 * Line-item level procurement actions.
 *
 * Ported from the Trava backend, which addressed a line item directly
 * (/procurement/items/:itemId/...) where this API nests it under its indent
 * (/procurement/indents/:id/items/:itemId). The mobile screens use the flat
 * form; the nested routes are untouched and remain what the web client uses.
 */
const items = new Hono<{ Variables: HonoVariables }>();

const requireWorkspace = (c: any) => c.req.query("workspaceId");

items.post("/:itemId/approve-quantity", async (c) => {
    const user = c.get("user");
    const itemId = c.req.param("itemId");
    const workspaceId = requireWorkspace(c);
    if (!workspaceId) return c.json({ success: false, error: "workspaceId is required" }, 400);

    const { isWorkspaceAdmin } = await fetchWorkspacePermissions(workspaceId, user.id);
    if (!isWorkspaceAdmin) {
        return c.json({ success: false, error: "Only Admins can approve quantities" }, 403);
    }

    const item = await prisma.indentLineItem.findUnique({ where: { id: itemId } });
    if (!item) return c.json({ success: false, error: "Line item not found" }, 404);

    // PENDING -> RFQ_SENT: quantity is settled, sourcing can start.
    await prisma.indentLineItem.update({
        where: { id: itemId },
        data: { status: LineItemStatus.RFQ_SENT, rfqSentAt: new Date() },
    });

    return c.json({ success: true, message: "Quantity approved, item moved to RFQ_SENT" });
});

items.post("/:itemId/add-quote", async (c) => {
    const user = c.get("user");
    const itemId = c.req.param("itemId");
    const workspaceId = requireWorkspace(c);
    if (!workspaceId) return c.json({ success: false, error: "workspaceId is required" }, 400);

    const { workspaceMemberId } = await fetchWorkspacePermissions(workspaceId, user.id);
    if (!workspaceMemberId) return c.json({ success: false, error: "Access denied" }, 403);

    const item = await prisma.indentLineItem.findUnique({ where: { id: itemId } });
    if (!item) return c.json({ success: false, error: "Line item not found" }, 404);

    const { vendorId, unitPrice, quantity, leadTimeDays, notes } = await c.req.json();
    if (!vendorId || unitPrice === undefined || quantity === undefined) {
        return c.json({ success: false, error: "vendorId, unitPrice, and quantity are required" }, 400);
    }

    const parsedUnitPrice = parseFloat(String(unitPrice));
    const parsedQuantity = parseFloat(String(quantity));
    if (Number.isNaN(parsedUnitPrice) || Number.isNaN(parsedQuantity)) {
        return c.json({ success: false, error: "unitPrice and quantity must be numbers" }, 400);
    }

    await prisma.$transaction(async (tx) => {
        await tx.vendorQuote.create({
            data: {
                lineItemId: itemId,
                vendorId,
                unitPrice: parsedUnitPrice,
                quantity: parsedQuantity,
                totalPrice: parsedUnitPrice * parsedQuantity,
                leadTimeDays: leadTimeDays ? parseInt(String(leadTimeDays), 10) : null,
                notes: notes || null,
                status: QuoteStatus.SUBMITTED,
            },
        });

        await tx.indentLineItem.update({
            where: { id: itemId },
            data: { status: LineItemStatus.QUOTES_RECEIVED },
        });
    });

    return c.json({ success: true, message: "Quote submitted successfully" });
});

items.post("/:itemId/approve-quote", async (c) => {
    const user = c.get("user");
    const itemId = c.req.param("itemId");
    const workspaceId = requireWorkspace(c);
    if (!workspaceId) return c.json({ success: false, error: "workspaceId is required" }, 400);

    const { isWorkspaceAdmin, workspaceMemberId } = await fetchWorkspacePermissions(workspaceId, user.id);
    if (!isWorkspaceAdmin || !workspaceMemberId) {
        return c.json({ success: false, error: "Only Admins can approve quotes" }, 403);
    }

    const { quoteId } = await c.req.json();
    if (!quoteId) return c.json({ success: false, error: "quoteId is required" }, 400);

    const item = await prisma.indentLineItem.findUnique({ where: { id: itemId } });
    if (!item) return c.json({ success: false, error: "Line item not found" }, 404);

    await prisma.$transaction(async (tx) => {
        await tx.vendorQuote.update({
            where: { id: quoteId },
            data: {
                status: QuoteStatus.APPROVED,
                reviewedById: workspaceMemberId,
                reviewedAt: new Date(),
            },
        });

        await tx.indentLineItem.update({
            where: { id: itemId },
            data: { status: LineItemStatus.APPROVED, approvedQuoteId: quoteId },
        });

        // The indent itself is only approved once no line item is still open.
        const remaining = await tx.indentLineItem.count({
            where: { indentId: item.indentId, status: { not: LineItemStatus.APPROVED } },
        });

        if (remaining === 0) {
            await tx.indent.update({
                where: { id: item.indentId },
                data: {
                    status: IndentStatus.APPROVED,
                    finalApprovedAt: new Date(),
                    finalApprovedById: workspaceMemberId,
                },
            });
        }
    });

    return c.json({ success: true, message: "Quote approved and item marked APPROVED" });
});

items.post("/:itemId/reject", async (c) => {
    const user = c.get("user");
    const itemId = c.req.param("itemId");
    const workspaceId = requireWorkspace(c);
    if (!workspaceId) return c.json({ success: false, error: "workspaceId is required" }, 400);

    const { isWorkspaceAdmin } = await fetchWorkspacePermissions(workspaceId, user.id);
    if (!isWorkspaceAdmin) {
        return c.json({ success: false, error: "Only Admins can reject items" }, 403);
    }

    const { reason } = await c.req.json().catch(() => ({ reason: undefined }));

    const item = await prisma.indentLineItem.findUnique({ where: { id: itemId } });
    if (!item) return c.json({ success: false, error: "Line item not found" }, 404);

    await prisma.indentLineItem.update({
        where: { id: itemId },
        data: {
            status: LineItemStatus.REJECTED,
            rejectionReason: reason || "No reason specified",
        },
    });

    return c.json({ success: true, message: "Item rejected successfully" });
});


/**
 * Catalog lookups the mobile procurement screens use.
 *
 * Mounted on this router purely so they answer under /procurement/*, the prefix
 * the client uses; the web reads the same data through /materials and /projects.
 */
export const procurementLookups = new Hono<{ Variables: HonoVariables }>();

procurementLookups.get("/procurable-projects", async (c) => {
    const user = c.get("user");
    const workspaceId = c.req.query("workspaceId");
    if (!workspaceId) return c.json({ success: false, error: "workspaceId is required" }, 400);

    const { workspaceMemberId, isWorkspaceAdmin } = await fetchWorkspacePermissions(workspaceId, user.id);
    if (!workspaceMemberId) return c.json({ success: false, error: "Access denied" }, 403);

    const projects = await prisma.project.findMany({
        where: {
            workspaceId,
            // A non-admin only sees projects they belong to.
            ...(isWorkspaceAdmin
                ? {}
                : { projectMembers: { some: { workspaceMember: { userId: user.id } } } }),
        },
        select: {
            id: true,
            name: true,
            slug: true,
            color: true,
            description: true,
            tasks: { select: { id: true, name: true, taskSlug: true } },
        },
        orderBy: { createdAt: "desc" },
    });

    return c.json({ success: true, projects, data: projects });
});

procurementLookups.get("/materials", async (c) => {
    const user = c.get("user");
    const workspaceId = c.req.query("workspaceId");
    if (!workspaceId) return c.json({ success: false, error: "workspaceId is required" }, 400);

    const { workspaceMemberId } = await fetchWorkspacePermissions(workspaceId, user.id);
    if (!workspaceMemberId) return c.json({ success: false, error: "Access denied" }, 403);

    const materials = await prisma.materialCatalog.findMany({
        where: { workspaceId },
        orderBy: { name: "asc" },
    });

    return c.json({ success: true, materials, data: materials });
});

export default items;
