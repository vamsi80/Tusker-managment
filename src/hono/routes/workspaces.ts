import { Hono } from "hono";
import { HonoVariables } from "../types";
import { WorkspaceService } from "@/server/services/workspace.service";
import { workSpaceSchema, updateWorkspaceInfoSchema } from "@/lib/zodSchemas";
import { AppError } from "@/lib/errors/app-error";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";

const workspaces = new Hono<{ Variables: HonoVariables }>();

/**
 * POST /api/v1/workspaces
 * Create a new workspace
 */
workspaces.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json();

  const validation = workSpaceSchema.safeParse(body);
  if (!validation.success) {
    throw AppError.ValidationError("Invalid workspace data");
  }

  const { name, slug } = validation.data;

  const workspace = await WorkspaceService.createWorkspace({
    name,
    slug,
    ownerId: user.id,
  });

  return c.json({ success: true, data: workspace });
});

/**
 * GET /api/v1/workspaces/verify
 * Verify invitation token and redirect to workspace.
 */
workspaces.get("/verify", async (c) => {
  const user = c.get("user");
  const q = c.req.query();
  const workspaceId = q.workspaceId;
  const role = q.role;

  if (!workspaceId || !role) {
    return c.redirect("/");
  }

  await WorkspaceService.verifyInvitation(workspaceId, role, user.id);

  return c.redirect(`/w/${workspaceId}`);
});

/**
 * PATCH /api/v1/workspaces/:workspaceId
 * Update workspace info
 */
workspaces.patch("/:workspaceId", async (c) => {
  const user = c.get("user");
  const workspaceId = c.req.param("workspaceId");
  const body = await c.req.json();

  const validation = updateWorkspaceInfoSchema.safeParse({
    ...body,
    workspaceId,
  });
  if (!validation.success) {
    throw AppError.ValidationError("Invalid update data");
  }

  // Check permissions
  const { isWorkspaceAdmin } = await getWorkspacePermissions(workspaceId);
  if (!isWorkspaceAdmin) {
    throw AppError.Forbidden(
      "You don't have permission to update this workspace",
    );
  }

  const { name, ...otherData } = validation.data;

  // Note: The service currently only supports name/slug but schema has more.
  // I will expand the service to handle full updates if needed,
  // for now sticking to what service has or expanding it.
  const updated = await WorkspaceService.updateWorkspace(
    workspaceId,
    { name },
    user.id,
  );

  return c.json({ success: true, data: updated });
});

/**
 * DELETE /api/v1/workspaces/:workspaceId
 * Delete a workspace
 */
workspaces.delete("/:workspaceId", async (c) => {
  const user = c.get("user");
  const workspaceId = c.req.param("workspaceId");

  await WorkspaceService.deleteWorkspace(workspaceId, user.id);

  return c.json({ success: true, message: "Workspace deleted" });
});

/**
 * GET /api/v1/workspaces/:workspaceId/members
 * Get workspace members
 */
workspaces.get("/:workspaceId/members", async (c) => {
  const workspaceId = c.req.param("workspaceId");

  const members = await WorkspaceService.getMembers(workspaceId);

  return c.json({ success: true, data: members });
});

/**
 * POST /api/v1/workspaces/:workspaceId/invite
 * Invite a new member to the workspace
 */
workspaces.post("/:workspaceId/invite", async (c) => {
  const user = c.get("user");
  const workspaceId = c.req.param("workspaceId");
  const body = await c.req.json();

  // 1. Permission Check
  const { isWorkspaceAdmin } = await getWorkspacePermissions(workspaceId);
  if (!isWorkspaceAdmin) {
    throw AppError.Forbidden("Only workspace admins can invite members.");
  }

  // 2. Execute Invitation
  const result = await WorkspaceService.inviteMember(
    { ...body, workspaceId },
    { id: user.id, name: (user as any).surname || user.name || "Admin" },
  );

  return c.json({
    success: true,
    message: "Member invited successfully",
    data: result,
  });
});

/**
 * DELETE /api/v1/workspaces/:workspaceId/members/:memberId
 * Remove a member from the workspace
 */
workspaces.delete("/:workspaceId/members/:memberId", async (c) => {
  const user = c.get("user");
  const workspaceId = c.req.param("workspaceId");
  const memberId = c.req.param("memberId");

  const result = await WorkspaceService.removeMember(
    workspaceId,
    memberId,
    user.id,
  );

  return c.json(result);
});

/**
 * PATCH /api/v1/workspaces/:workspaceId/members/:memberId
 * Update a member's role
 */
workspaces.patch("/:workspaceId/members/:memberId", async (c) => {
  const user = c.get("user");
  const workspaceId = c.req.param("workspaceId");
  const memberId = c.req.param("memberId");
  const body = await c.req.json();

  const { role } = body;
  if (!role) {
    throw AppError.ValidationError("Role is required");
  }

  // Permission check
  const { isWorkspaceAdmin } = await getWorkspacePermissions(workspaceId);
  if (!isWorkspaceAdmin) {
    throw AppError.Forbidden("Only admins can change member roles");
  }

  const result = await WorkspaceService.updateMemberRole(
    workspaceId,
    memberId,
    role,
    user.id,
  );

  return c.json(result);
});

/**
 * GET /api/v1/workspaces
 * List all workspaces for the current user
 */
workspaces.get("/", async (c) => {
  const user = c.get("user");
  const result = await WorkspaceService.getWorkspaces(user.id);
  return c.json({ success: true, data: result });
});

/**
 * GET /api/v1/workspaces/:workspaceId
 * Get workspace details by ID
 */
workspaces.get("/:workspaceId", async (c) => {
  const user = c.get("user");
  const workspaceId = c.req.param("workspaceId");

  const workspace = await WorkspaceService.getWorkspaceById(
    workspaceId,
    user.id,
  );
  if (!workspace) {
    throw AppError.NotFound("Workspace not found or access denied");
  }

  return c.json({ success: true, data: workspace });
});

/**
 * GET /api/v1/workspaces/:workspaceId/metadata
 * Get lightweight workspace metadata
 */
workspaces.get("/:workspaceId/metadata", async (c) => {
  const user = c.get("user");
  const workspaceId = c.req.param("workspaceId");

  const metadata = await WorkspaceService.getWorkspaceMetadata(
    workspaceId,
    user.id,
  );
  if (!metadata) {
    throw AppError.NotFound("Workspace not found or access denied");
  }

  return c.json({ success: true, data: metadata });
});

/**
 * GET /api/v1/workspaces/:workspaceId/layout
 * Get unified layout data
 */
workspaces.get("/:workspaceId/layout", async (c) => {
  const user = c.get("user");
  const workspaceId = c.req.param("workspaceId");

  const layoutData = await WorkspaceService.getWorkspaceLayoutData(
    workspaceId,
    user.id,
  );
  return c.json({ success: true, data: { ...layoutData, user } });
});

/**
 * GET /api/v1/workspaces/:workspaceId/kanban
 * Get project membership maps for Kanban
 */
workspaces.get("/:workspaceId/kanban", async (c) => {
  const workspaceId = c.req.param("workspaceId");

  const [pmMap, leadersMap] = await Promise.all([
    WorkspaceService.getWorkspaceProjectMembersMap(workspaceId),
    WorkspaceService.getWorkspaceProjectManagersMap(workspaceId),
  ]);

  return c.json({
    success: true,
    data: {
      projectUserMap: pmMap,
      projectLeadersMap: leadersMap,
    },
  });
});

/**
 * GET /api/v1/workspaces/:workspaceId/task-creation-data
 * Get all data needed for workspace-level task creation
 */
workspaces.get("/:workspaceId/task-creation-data", async (c) => {
  const user = c.get("user");
  const workspaceId = c.req.param("workspaceId");

  const data = await WorkspaceService.getWorkspaceTaskCreationData(
    workspaceId,
    user.id,
  );
  return c.json({ success: true, data });
});

/**
 * GET /api/v1/workspaces/:workspaceId/paginated-members
 * Get paginated workspace members
 */
workspaces.get("/:workspaceId/paginated-members", async (c) => {
  const user = c.get("user");
  const workspaceId = c.req.param("workspaceId");
  const cursor = c.req.query("cursor");
  const limit = parseInt(c.req.query("limit") || "10");

  const members = await WorkspaceService.getWorkspaceMembers(
    workspaceId,
    cursor,
    Math.min(limit, 50),
  );

  let nextCursor: string | undefined;
  if (members.length > limit) {
    const nextItem = members.pop();
    nextCursor = nextItem?.id;
  }

  return c.json({ success: true, data: { members, nextCursor } });
});

export default workspaces;
