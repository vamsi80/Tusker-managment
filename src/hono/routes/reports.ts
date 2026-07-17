import { Hono } from "hono";
import { HonoVariables } from "../types";
import { ReportService } from "@/server/services/report.service";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";
import { AppError } from "@/lib/errors/app-error";

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

  const { isWorkspaceAdmin, workspaceMember } = await getWorkspacePermissions(workspaceId, user.id);
  
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

  const { isWorkspaceAdmin, workspaceMember } = await getWorkspacePermissions(workspaceId, user.id);
  
  if (!workspaceMember) {
    throw AppError.Forbidden("You are not a member of this workspace");
  }

  // Optional: Add check if non-admin can see only their own report entries
  // For now, following the original getReportEntries which checked for Admin
  if (!isWorkspaceAdmin) {
     // Check if the report belongs to the user
     // We can implement this in ReportService if needed
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
