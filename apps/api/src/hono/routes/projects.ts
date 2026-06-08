import { Hono } from "hono";
import { HonoVariables } from "../types";
import { AppError } from "@tusker/shared/errors";
import { ProjectService } from "@/server/services/project";
import { zValidator } from "@hono/zod-validator";
import { projectSchema, editProjectSchema } from "@tusker/shared";
import { getDb } from "@/lib/registry";

const projects = new Hono<{ Variables: HonoVariables }>();

/**
 * POST /api/v1/projects
 * Create a new project.
 */
projects.post("/", zValidator("json", projectSchema), async (c) => {
  const user = c.get("user");
  const values = c.req.valid("json");

  const data = await ProjectService.createProject(user.id, values);
  return c.json({ success: true, data });
});

/**
 * PATCH /api/v1/projects/:projectId
 * Update a project.
 */
projects.patch("/:projectId", zValidator("json", editProjectSchema), async (c) => {
  const user = c.get("user");
  const values = c.req.valid("json");

  await ProjectService.updateProject(user.id, values);
  return c.json({ success: true, message: "Project updated successfully" });
});

/**
 * DELETE /api/v1/projects/:projectId
 * Delete a project.
 */
projects.delete("/:projectId", async (c) => {
  const user = c.get("user");
  const projectId = c.req.param("projectId");

  await ProjectService.deleteProject(user.id, projectId);
  return c.json({ success: true, message: "Project deleted successfully" });
});

/**
 * POST /api/v1/projects/:projectId/members
 * Add members to a project.
 */
projects.post("/:projectId/members", async (c) => {
  const user = c.get("user");
  const projectId = c.req.param("projectId");
  const { memberUserIds } = await c.req.json();

  await ProjectService.addMembers(user.id, projectId, memberUserIds);
  return c.json({ success: true, message: "Members added successfully" });
});

/**
 * DELETE /api/v1/projects/:projectId/members
 * Remove members from a project.
 */
projects.delete("/:projectId/members", async (c) => {
  const user = c.get("user");
  const projectId = c.req.param("projectId");
  const { memberUserIds } = await c.req.json();

  await ProjectService.removeMembers(user.id, projectId, memberUserIds);
  return c.json({ success: true, message: "Members removed successfully" });
});

/**
 * PATCH /api/v1/projects/:projectId/members/:userId/role
 * Update member role.
 */
projects.patch("/:projectId/members/:userId/role", async (c) => {
  const user = c.get("user");
  const projectId = c.req.param("projectId");
  const targetUserId = c.req.param("userId");
  const { role } = await c.req.json();

  await ProjectService.updateMemberRole(user.id, projectId, targetUserId, role);
  return c.json({ success: true, message: "Member role updated successfully" });
});

/**
 * POST /api/v1/projects/:projectId/members/:userId/toggle-access
 * Toggle member access.
 */
projects.post("/:projectId/members/:userId/toggle-access", async (c) => {
  const user = c.get("user");
  const projectId = c.req.param("projectId");
  const targetUserId = c.req.param("userId");

  await ProjectService.toggleMemberAccess(user.id, projectId, targetUserId);
  return c.json({ success: true, message: "Member access toggled successfully" });
});

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
 * GET /api/v1/projects/workspace-clients
 * Fetch all clients in a workspace.
 */
projects.get("/workspace-clients", async (c) => {
  const workspaceId = c.req.query("workspaceId");

  if (!workspaceId) {
    throw AppError.ValidationError("workspaceId query parameter is required");
  }

  const clients = await ProjectService.getWorkspaceClients(workspaceId);
  return c.json({ success: true, data: clients });
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
 * GET /api/v1/projects/project-members?workspaceId=
 * Get all unique members across all projects in a workspace.
 * Must be registered before GET /:projectId to avoid route shadowing.
 */
projects.get("/project-members", async (c) => {
  const workspaceId = c.req.query("workspaceId");

  if (!workspaceId) {
    throw AppError.ValidationError("workspaceId query parameter is required");
  }

  const members = await ProjectService.getWorkspaceProjectMembers(workspaceId);
  return c.json({ success: true, data: members });
});

/**
 * GET /api/v1/projects/slug/:slug/metadata
 * Must be registered before GET /:projectId to avoid route shadowing.
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
 * GET /api/v1/projects/slug/:slug/dashboard?workspaceId=
 * Get project dashboard data.
 * Must be registered before GET /:projectId to avoid route shadowing.
 */
projects.get("/slug/:slug/dashboard", async (c) => {
  const slug = c.req.param("slug");
  const workspaceId = c.req.query("workspaceId");
  const user = c.get("user");

  if (!workspaceId) {
    throw AppError.ValidationError("workspaceId query parameter is required");
  }

  const data = await ProjectService.getProjectDashboardData(workspaceId, slug, user.id);
  if (!data) {
    throw AppError.NotFound("Project not found or access denied");
  }

  return c.json({ success: true, data });
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
 * GET /api/v1/projects/:projectId/reviewers
 */
projects.get("/:projectId/reviewers", async (c) => {
  const projectId = c.req.param("projectId");
  const reviewers = await ProjectService.getProjectReviewers(projectId);
  return c.json({ success: true, data: reviewers });
});

/**
 * GET /api/v1/projects/:projectId/members
 */
projects.get("/:projectId/members", async (c) => {
  const user = c.get("user");
  const projectId = c.req.param("projectId");
  let workspaceId = c.req.query("workspaceId");

  if (!workspaceId) {
    const proj = await getDb().project.findUnique({
      where: { id: projectId },
      select: { workspaceId: true },
    });
    if (!proj) throw AppError.NotFound("Project not found");
    workspaceId = proj.workspaceId;
  }

  const permissions = await ProjectService.getPermissions(workspaceId, projectId, user.id);
  if (!permissions.workspaceMemberId) {
    throw AppError.Forbidden("Access denied");
  }

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

export default projects;
