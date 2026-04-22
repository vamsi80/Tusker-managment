import { Hono } from "hono";
import { HonoVariables } from "../types";
import { AppError } from "@/lib/errors/app-error";
import { ProjectService } from "@/server/services/project.service";

const projects = new Hono<{ Variables: HonoVariables }>();

/**
 * GET /api/v1/projects/:projectId/layout-data
 * Aggregated fetch for project members and permissions.
 * Optimized for ProjectLayoutProvider.
 */
projects.get("/:projectId/layout-data", async (c) => {
  const projectId = c.req.param("projectId");
  const workspaceId = c.req.query("workspaceId");
  const user = c.get("user");

  if (!workspaceId) {
    throw AppError.ValidationError("workspaceId query parameter is required");
  }

  const data = await ProjectService.getProjectLayoutData(workspaceId, projectId, user.id);
  return c.json({ success: true, data });
});

/**
 * GET /api/v1/projects/:projectId/reviewers
 * Fetch all available reviewers for a project.
 */
projects.get("/:projectId/reviewers", async (c) => {
  const projectId = c.req.param("projectId");
  if (!projectId) {
    throw AppError.ValidationError("Project ID is required");
  }

  try {
    const reviewers = await ProjectService.getProjectReviewers(projectId);
    return c.json(reviewers);
  } catch (error) {
    console.error("[HONO_PROJECT_REVIEWERS_GET]", error);
    throw AppError.Internal("Failed to fetch project reviewers");
  }
});

/**
 * GET /api/v1/projects/:projectId/members
 * Fetch all members of a project.
 */
projects.get("/:projectId/members", async (c) => {
  const projectId = c.req.param("projectId");
  const members = await ProjectService.getMembers(projectId);
  return c.json({ success: true, data: members });
});

/**
 * GET /api/v1/projects/:projectId/permissions
 * Fetch user permissions for a specific project.
 */
projects.get("/:projectId/permissions", async (c) => {
  const user = c.get("user");
  const projectId = c.req.param("projectId");
  const workspaceId = c.req.query("workspaceId");

  if (!workspaceId) {
    throw AppError.ValidationError("workspaceId query parameter is required");
  }

  const permissions = await ProjectService.getPermissions(workspaceId, projectId, user.id);
  return c.json({ success: true, data: permissions });
});

export default projects;
