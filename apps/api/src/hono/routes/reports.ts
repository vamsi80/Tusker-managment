import { Hono } from "hono";
import { HonoVariables } from "../types";
import { ReportService } from "@tusker/core/server/services/report.service";
import { fetchWorkspacePermissions } from "@tusker/core/permissions";
import { AppError } from "@tusker/core/lib/errors/app-error";
import prisma from "@tusker/db";

const reports = new Hono<{ Variables: HonoVariables }>();

const parseMultiQuery = (value?: string): string[] | undefined => {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value);
    const values = Array.isArray(parsed) ? parsed : [parsed];
    const cleaned = values.map(String).filter(Boolean);
    return cleaned.length > 0 ? cleaned : undefined;
  } catch {
    const cleaned = value.split(",").map((item) => item.trim()).filter(Boolean);
    return cleaned.length > 0 ? cleaned : undefined;
  }
};

/**
 * GET /api/v1/reports/:workspaceId
 * Load daily reports for a workspace with optional filters
 */
reports.get("/:workspaceId", async (c) => {
  const user = c.get("user");
  const workspaceId = c.req.param("workspaceId");
  
  const date = c.req.query("date");
  const userId = parseMultiQuery(c.req.query("userId"));
  const skip = parseInt(c.req.query("skip") || "0");
  const take = parseInt(c.req.query("take") || "30");

  const { isWorkspaceAdmin, workspaceMember } = await fetchWorkspacePermissions(workspaceId, user.id);
  
  if (!workspaceMember) {
    throw AppError.Forbidden("You are not a member of this workspace");
  }

  const result = await ReportService.getReports({
    workspaceId,
    date,
    userId,
    skip,
    take,
    isWorkspaceAdmin,
    currentWorkspaceMemberId: workspaceMember.id
  });

  return c.json({ success: true, data: result });
});

/**
 * GET /api/v1/reports/:workspaceId/entries/:reportId
 * Get detailed entries for a specific report
 */
reports.get("/:workspaceId/entries/:reportId", async (c) => {
  const user = c.get("user");
  const workspaceId = c.req.param("workspaceId");
  const reportId = c.req.param("reportId");

  const { isWorkspaceAdmin, workspaceMember } = await fetchWorkspacePermissions(workspaceId, user.id);
  
  if (!workspaceMember) {
    throw AppError.Forbidden("You are not a member of this workspace");
  }

  // ponytail: ensure report belongs to the scoped workspace
  const report = await prisma.dailyReport.findUnique({
    where: { id: reportId },
    select: { workspaceId: true, userId: true },
  });
  if (!report || report.workspaceId !== workspaceId) {
    throw AppError.NotFound("Report not found in this workspace");
  }

  // Non-admins may only view their own report entries
  if (!isWorkspaceAdmin && report.userId !== user.id) {
    throw AppError.Forbidden("You do not have access to this report");
  }

  const result = await ReportService.getReportEntries(reportId);

  return c.json({ success: true, data: result });
});

/**
 * GET /api/v1/reports/:workspaceId/status
 * Get the current user's report status for today
 */
reports.get("/:workspaceId/status", async (c) => {
  const user = c.get("user");
  const workspaceId = c.req.param("workspaceId");

  const result = await ReportService.getReportStatus(workspaceId, user.id);
  return c.json({ success: true, data: result });
});

/**
 * GET /api/v1/reports/:workspaceId/form-data
 * Get tasks and existing report info for the submission form
 */
reports.get("/:workspaceId/form-data", async (c) => {
  const user = c.get("user");
  const workspaceId = c.req.param("workspaceId");

  const result = await ReportService.getReportFormData(workspaceId, user.id);
  return c.json({ success: true, data: result });
});

/**
 * POST /api/v1/reports/:workspaceId
 * Submit a daily report
 */
reports.post("/:workspaceId", async (c) => {
  const user = c.get("user");
  const workspaceId = c.req.param("workspaceId");
  const body = await c.req.json();

  // Validate workspaceId in body matches param
  if (body.workspaceId !== workspaceId) {
    throw AppError.ValidationError("Workspace ID mismatch");
  }

  const result = await ReportService.submitReport(user.id, body);
  return c.json({ success: true, data: result });
});

export default reports;
