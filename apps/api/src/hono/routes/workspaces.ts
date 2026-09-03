import { Hono } from "hono";
import { HonoVariables } from "../types";
import { WorkspaceService } from "@tusker/core/server/services/workspace.service";
import { workSpaceSchema, updateWorkspaceInfoSchema, updateMemberSchema } from "@tusker/core/lib/zodSchemas";
import { AppError } from "@tusker/core/lib/errors/app-error";
import { fetchWorkspacePermissions } from "@tusker/core/permissions";
import prisma from "@tusker/db";
import { ProjectService } from "@tusker/core/server/services/project/project.service";
import { TagService } from "@tusker/core/server/services/tag/tag.service";
import { AttendanceService } from "@tusker/core/server/services/attendance/index";

const workspaces = new Hono<{ Variables: HonoVariables }>();

/**
 * GET /api/v1/workspaces/bootstrap
 *
 * One round trip for a cold mobile start: the user's workspaces, the active
 * one, and its projects, tags and attendance. Registered before /:workspaceId
 * so "bootstrap" is not read as an id.
 */
workspaces.get("/bootstrap", async (c) => {
    const user = c.get("user");
    const preferredWorkspaceId = c.req.query("workspaceId") || undefined;
    const clientDateString = c.req.query("clientDateString");
    const requestedDate = clientDateString ? new Date(clientDateString) : new Date();
    const registerDate = Number.isNaN(requestedDate.getTime()) ? new Date() : requestedDate;

    try {
        const workspaceResult = await WorkspaceService.getWorkspaces(user.id);
        const list = (workspaceResult as any).workspaces ?? workspaceResult ?? [];
        const selectedWorkspace =
            list.find((w: any) => w.id === preferredWorkspaceId) ?? list[0] ?? null;

        if (!selectedWorkspace) {
            return c.json({
                success: true,
                workspaces: list,
                activeWorkspace: null,
                projects: [],
                tags: [],
                todayAttendance: null,
                teamAttendance: [],
            });
        }

        const isAdmin =
            selectedWorkspace.workspaceRole === "OWNER" ||
            selectedWorkspace.workspaceRole === "ADMIN";

        const [projects, tags, todayAttendance, teamAttendance] = await Promise.all([
            ProjectService.getWorkspaceProjects(selectedWorkspace.id, user.id),
            TagService.listWorkspaceTags(selectedWorkspace.id),
            AttendanceService.getTodayAttendance(selectedWorkspace.id, user.id),
            // getTeamRegister, not getWorkspaceAttendance: the client filters
            // this array directly, while getWorkspaceAttendance returns a
            // paginated { data, totalCount } object and skips members who have
            // no record for the day.
            isAdmin
                ? AttendanceService.getTeamRegister(selectedWorkspace.id, registerDate)
                : Promise.resolve([]),
        ]);

        return c.json({
            success: true,
            workspaces: list,
            activeWorkspace: selectedWorkspace,
            projects,
            tags,
            todayAttendance,
            teamAttendance,
        });
    } catch (error: any) {
        console.error("API Error [workspaces/bootstrap]:", error);
        return c.json({ success: false, error: error.message || "Internal Server Error" }, 500);
    }
});

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
  const { isWorkspaceAdmin } = await fetchWorkspacePermissions(workspaceId, user.id);
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
 * GET /api/v1/workspaces/:workspaceId/members/slim
 * Get all members with minimal fields (for filters)
 */
workspaces.get("/:workspaceId/members/slim", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const members = await WorkspaceService.getMembersSlim(workspaceId);
  return c.json({ success: true, data: members });
});

/**
 * GET /api/v1/workspaces/:workspaceId/birthdays
 * Members with a birthday in the current month.
 */
workspaces.get("/:workspaceId/birthdays", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const user = c.get("user");
  const members = await WorkspaceService.getBirthdaysThisMonth(workspaceId, user.id);
  return c.json({ success: true, data: members, birthdays: members });
});

workspaces.get("/:workspaceId/members", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  console.log(`[HONO_WORKSPACES] GET /members workspaceId: ${workspaceId}`);
  const page = parseInt(c.req.query("page") || "1");
  const limit = parseInt(c.req.query("limit") || "10");
  const search = c.req.query("search");

  // Accepts ?role=MANAGER, repeated keys, a JSON array or a comma list.
  const roleValues = c.req.queries("role") ?? [];
  const roles = roleValues.flatMap((v) => {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed.map(String) : [String(parsed)];
    } catch {
      return v.split(",").map((x) => x.trim()).filter(Boolean);
    }
  });

  const members = await WorkspaceService.getMembers(
    workspaceId,
    page,
    limit,
    search,
    roles.length > 0 ? roles : undefined,
  );

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
  const { isWorkspaceAdmin } = await fetchWorkspacePermissions(workspaceId, user.id);
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
 * GET /api/v1/workspaces/:workspaceId/managers
 * Get all members with MANAGER role in a workspace
 */
workspaces.get("/:workspaceId/managers", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const result = await WorkspaceService.getWorkspaceManagers(workspaceId);
  return c.json({ success: true, data: result });
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
 * POST /api/v1/workspaces/:workspaceId/members/:memberId/resend-invite
 * Resend invitation email
 */
workspaces.post("/:workspaceId/members/:memberId/resend-invite", async (c) => {
  const user = c.get("user");
  const workspaceId = c.req.param("workspaceId");
  const memberId = c.req.param("memberId");

  // 1. Permission Check
  const { isWorkspaceAdmin } = await fetchWorkspacePermissions(workspaceId, user.id);
  if (!isWorkspaceAdmin) {
    throw AppError.Forbidden("Only workspace admins can resend invitations.");
  }

  const result = await WorkspaceService.resendInvitation(
    workspaceId,
    memberId,
    { id: user.id, name: user.name || "Admin" },
  );

  return c.json(result);
});

/**
 * POST /api/v1/workspaces/:workspaceId/members/:memberId/reset-password
 * Send password reset email
 */
workspaces.post("/:workspaceId/members/:memberId/reset-password", async (c) => {
  const user = c.get("user");
  const workspaceId = c.req.param("workspaceId");
  const memberId = c.req.param("memberId");

  // 1. Permission Check
  const { isWorkspaceAdmin } = await fetchWorkspacePermissions(workspaceId, user.id);
  if (!isWorkspaceAdmin) {
    throw AppError.Forbidden("Only workspace admins can reset passwords.");
  }

  const result = await WorkspaceService.resetMemberPassword(
    workspaceId,
    memberId,
    { id: user.id, name: user.name || "Admin" },
  );

  return c.json(result);
});

/**
 * PATCH /api/v1/workspaces/:workspaceId/members/:memberId
 * Update a member's information
 */
workspaces.patch("/:workspaceId/members/:memberId", async (c) => {
  const user = c.get("user");
  const workspaceId = c.req.param("workspaceId");
  const memberId = c.req.param("memberId");
  const body = await c.req.json();

  const validation = updateMemberSchema.safeParse(body);
  if (!validation.success) {
    throw AppError.ValidationError(validation.error.issues[0].message);
  }

  // Permission check
  const { isWorkspaceAdmin } = await fetchWorkspacePermissions(workspaceId, user.id);
  if (!isWorkspaceAdmin) {
    throw AppError.Forbidden("Only admins can change member information");
  }

  const result = await WorkspaceService.updateMember(
    workspaceId,
    memberId,
    validation.data,
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
  return c.json({
    success: true,
    data: layoutData,
  });
});

/**
 * GET /api/v1/workspaces/:workspaceId/notifications/unread-count
 */
workspaces.get("/:workspaceId/notifications/unread-count", async (c) => {
  const user = c.get("user");
  const workspaceId = c.req.param("workspaceId");

  const count = await WorkspaceService.getUnreadNotificationsCount(
    workspaceId,
    user.id,
  );
  return c.json({ success: true, data: count });
});



/**
 * GET /api/v1/workspaces/:workspaceId/paginated-members
 * Get paginated workspace members
 */
workspaces.get("/:workspaceId/paginated-members", async (c) => {
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


/**
 * GET /api/v1/workspaces/:workspaceId/notifications/:id/read
 * Mark a generic notification as read
 */
workspaces.get("/:workspaceId/notifications/:id/read", async (c) => {
  const { id } = c.req.param();

  await prisma.notification.update({
    where: { id },
    data: { isRead: true }
  });

  return c.json({ success: true });
});

/**
 * Attendance/shift settings, addressed by ?workspaceId=.
 *
 * Registered after the /:workspaceId routes above so "settings" is not read as
 * an id. Also reachable at /api/v1/workspace/settings, the singular path the
 * mobile client uses — see the alias mount in hono/index.ts.
 */
workspaces.get("/settings", async (c) => {
  const user = c.get("user");
  const workspaceId = c.req.query("workspaceId");
  if (!workspaceId) throw AppError.ValidationError("Missing workspaceId");

  const settings = await WorkspaceService.getSettings(workspaceId, user.id);
  return c.json({ success: true, data: settings });
});

workspaces.patch("/settings", async (c) => {
  const user = c.get("user");
  const workspaceId = c.req.query("workspaceId");
  if (!workspaceId) throw AppError.ValidationError("Missing workspaceId");

  const body = await c.req.json();
  const updated = await WorkspaceService.updateSettings(workspaceId, user.id, body);
  return c.json({ success: true, data: updated });
});

export default workspaces;
