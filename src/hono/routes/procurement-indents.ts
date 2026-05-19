import { Hono } from "hono";
import { HonoVariables } from "../types";
import { AppError } from "@/lib/errors/app-error";
import { VendorRepository } from "@/server/services/procurement/vendor.repository";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";
import prisma from "@/lib/db";

const procurementIndents = new Hono<{ Variables: HonoVariables }>();

/**
 * GET /api/v1/procurement/indents/:id/items/:itemId/suggested-vendors
 * Get intelligent vendor suggestions for a line item using trigram similarity
 */
procurementIndents.get("/:id/items/:itemId/suggested-vendors", async (c) => {
  const user = c.get("user");
  const indentId = c.req.param("id");
  const itemId = c.req.param("itemId");
  const workspaceId = c.req.query("w");

  if (!workspaceId) throw AppError.ValidationError("Missing workspaceId (w)");

  // Permission check
  const perms = await getWorkspacePermissions(workspaceId, user.id);
  if (perms.workspaceRole !== "PROCUREMENT" && !perms.isWorkspaceAdmin) {
    throw AppError.Forbidden("Insufficient permissions. Requires ADMIN or PROCUREMENT role.");
  }

  // 1. Fetch IndentLineItem to get materialName
  const lineItem = await prisma.indentLineItem.findFirst({
    where: {
      id: itemId,
      indentId: indentId,
      indent: { workspaceId }
    }
  });

  if (!lineItem) throw AppError.NotFound("Indent line item not found");

  // 2. Call VendorRepository.findSuggestedVendors
  const rawSuggestions = await VendorRepository.findSuggestedVendors(workspaceId, lineItem.materialName);

  // 3. Call VendorRepository.enrichSuggestions
  const enrichedSuggestions = await VendorRepository.enrichSuggestions(rawSuggestions);

  // 4. Return
  return c.json({ success: true, data: enrichedSuggestions });
});

export default procurementIndents;
