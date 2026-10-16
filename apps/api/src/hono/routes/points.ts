import { Hono } from "hono";
import { HonoVariables } from "../types";
import { PointsService } from "@tusker/core/server/services/points/points.service";

/**
 * Reward points. Reads are scoped per caller by PointsService.visibleMemberIds;
 * awarding is gated inside PointsService.awardManual on the points:award
 * capability, per handler rather than router middleware, because the reads on
 * this same router must stay open to every member.
 */
const points = new Hono<{ Variables: HonoVariables }>();

/**
 * GET /api/v1/points/:workspaceId/summary
 * Current-period totals for every member the caller may see.
 */
points.get("/:workspaceId/summary", async (c) => {
  const user = c.get("user");
  const result = await PointsService.summary(c.req.param("workspaceId"), user.id);
  return c.json({ success: true, data: result });
});

/**
 * GET /api/v1/points/:workspaceId/entries?memberId=&limit=&cursor=
 * Ledger lines for the current period, newest first.
 */
points.get("/:workspaceId/entries", async (c) => {
  const user = c.get("user");
  const limit = Number.parseInt(c.req.query("limit") || "", 10);
  const result = await PointsService.entries(c.req.param("workspaceId"), user.id, {
    memberId: c.req.query("memberId") || undefined,
    cursor: c.req.query("cursor") || undefined,
    limit: Number.isFinite(limit) ? limit : undefined,
  });
  return c.json({ success: true, data: result });
});

/**
 * POST /api/v1/points/:workspaceId/awards  { memberId, points, reason }
 * Award (positive) or deduct (negative) points by hand. Reason required.
 */
points.post("/:workspaceId/awards", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  const entry = await PointsService.awardManual(c.req.param("workspaceId"), user.id, body);
  return c.json({ success: true, data: entry }, 201);
});

export default points;
