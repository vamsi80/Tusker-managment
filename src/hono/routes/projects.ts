import { Hono } from "hono";
import { HonoVariables } from "../types";
import { AppError } from "@/lib/errors/app-error";
import { ProjectService } from "@/server/services/project.service";

const projects = new Hono<{ Variables: HonoVariables }>();

/**
 * GET /api/v1/projects
 * Fetch projects for a workspace.
 */
projects.get("/", async (c) => {
  const user = c.get("user");
  const workspaceId = c.req.query("workspaceId");
  const minimal = c.req.query("minimal") === "true";

  if (!workspaceId) {
    throw AppError.ValidationError("workspaceId query parameter is required");
  }

  const data = minimal 
    ? await ProjectService.getMinimalWorkspaceProjects(workspaceId, user.id)
    : await ProjectService.getWorkspaceProjects(workspaceId, user.id);
    
  return c.json({ success: true, data });
});

/**
 * GET /api/v1/projects/workspace-members
 * Fetch all workspace members for project lead/manager selection.
 */
projects.get("/workspace-members", async (c) => {
  const workspaceId = c.req.query("workspaceId");

  if (!workspaceId) {
    throw AppError.ValidationError("workspaceId query parameter is required");
  }

  const members = await ProjectService.getWorkspaceMembers(workspaceId);
  return c.json({ success: true, data: members });
});

/**
 * GET /api/v1/projects/assignment-maps
 * Get project assignment maps (members & leaders)
 */
projects.get("/assignment-maps", async (c) => {
  const workspaceId = c.req.query("workspaceId");

  if (!workspaceId) {
    throw AppError.ValidationError("workspaceId query parameter is required");
  }

  const [assignments, leaders] = await Promise.all([
    ProjectService.getWorkspaceProjectAssignments(workspaceId),
    ProjectService.getWorkspaceProjectLeaders(workspaceId),
  ]);

  return c.json({
    success: true,
    data: {
      projectAssignments: assignments,
      projectLeaders: leaders,
    },
  });
});

/**
 * GET /api/v1/projects/:projectId/layout-data
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
 * GET /api/v1/projects/:projectId
 */
projects.get("/:projectId", async (c) => {
  const projectId = c.req.param("projectId");
  const user = c.get("user");

  const data = await ProjectService.getFullProjectData(projectId, user.id);
  if (!data) {
    throw AppError.NotFound("Project not found or access denied");
  }

  return c.json({ success: true, data });
});

/**
 * GET /api/v1/projects/slug/:slug/metadata
 */
projects.get("/slug/:slug/metadata", async (c) => {
  const slug = c.req.param("slug");
  const workspaceId = c.req.query("workspaceId");
  const user = c.get("user");

  if (!workspaceId) {
    throw AppError.ValidationError("workspaceId query parameter is required");
  }

  const data = await ProjectService.getProjectMetadata(workspaceId, slug, user.id);
  if (!data) {
    throw AppError.NotFound("Project not found or access denied");
  }

  return c.json({ success: true, data });
});

/**
 * GET /api/v1/projects/:projectId/reviewers
 */
projects.get("/:projectId/reviewers", async (c) => {
  const projectId = c.req.param("projectId");
  const reviewers = await ProjectService.getProjectReviewers(projectId);
  return c.json(reviewers);
});

/**
 * GET /api/v1/projects/:projectId/members
 */
projects.get("/:projectId/members", async (c) => {
  const projectId = c.req.param("projectId");
  const members = await ProjectService.getMembers(projectId);
  return c.json({ success: true, data: members });
});

/**
 * GET /api/v1/projects/:projectId/permissions
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
