import { Hono } from "hono";
import { HonoVariables } from "../types";
import { MemberTodoService } from "@/server/services/member-todo/member-todo.service";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";
import { AppError } from "@tusker/shared/errors";

const memberTodos = new Hono<{ Variables: HonoVariables }>();

/**
 * GET /api/v1/member-todos/:workspaceId
 * List todos for the current workspace member
 */
memberTodos.get("/:workspaceId", async (c) => {
  const user = c.get("user");
  const workspaceId = c.req.param("workspaceId");

  const { workspaceMemberId } = await getWorkspacePermissions(workspaceId, user.id);
  if (!workspaceMemberId) {
    throw AppError.Forbidden("You are not a member of this workspace");
  }

  const result = await MemberTodoService.getTodos(workspaceMemberId);
  return c.json({ success: true, data: result });
});

/**
 * POST /api/v1/member-todos/:workspaceId
 * Create a new todo
 */
memberTodos.post("/:workspaceId", async (c) => {
  const user = c.get("user");
  const workspaceId = c.req.param("workspaceId");
  const { text } = await c.req.json();

  const { workspaceMemberId } = await getWorkspacePermissions(workspaceId, user.id);
  if (!workspaceMemberId) {
    throw AppError.Forbidden("You are not a member of this workspace");
  }

  const result = await MemberTodoService.createTodo(workspaceMemberId, text);
  return c.json({ success: true, data: result });
});

/**
 * PUT /api/v1/member-todos/:workspaceId/:id
 * Edit todo text
 */
memberTodos.put("/:workspaceId/:id", async (c) => {
  const user = c.get("user");
  const workspaceId = c.req.param("workspaceId");
  const id = c.req.param("id");
  const { text } = await c.req.json();

  const { workspaceMemberId } = await getWorkspacePermissions(workspaceId, user.id);
  if (!workspaceMemberId) {
    throw AppError.Forbidden("You are not a member of this workspace");
  }

  const result = await MemberTodoService.editTodo(id, workspaceMemberId, text);
  return c.json({ success: true, data: result });
});

/**
 * PATCH /api/v1/member-todos/:workspaceId/reorder
 * Reorder todos
 */
memberTodos.patch("/:workspaceId/reorder", async (c) => {
  const user = c.get("user");
  const workspaceId = c.req.param("workspaceId");
  const { todoIds } = await c.req.json();

  if (!Array.isArray(todoIds)) {
    throw AppError.ValidationError("todoIds must be an array of IDs");
  }

  const { workspaceMemberId } = await getWorkspacePermissions(workspaceId, user.id);
  if (!workspaceMemberId) {
    throw AppError.Forbidden("You are not a member of this workspace");
  }

  const result = await MemberTodoService.reorderTodos(workspaceMemberId, todoIds);
  return c.json({ success: true, data: result });
});

/**
 * PATCH /api/v1/member-todos/:workspaceId/:id
 * Toggle todo completed status
 */
memberTodos.patch("/:workspaceId/:id", async (c) => {
  const user = c.get("user");
  const workspaceId = c.req.param("workspaceId");
  const id = c.req.param("id");

  const { workspaceMemberId } = await getWorkspacePermissions(workspaceId, user.id);
  if (!workspaceMemberId) {
    throw AppError.Forbidden("You are not a member of this workspace");
  }

  const result = await MemberTodoService.toggleTodo(id, workspaceMemberId);
  return c.json({ success: true, data: result });
});

/**
 * DELETE /api/v1/member-todos/:workspaceId/:id
 * Delete a todo
 */
memberTodos.delete("/:workspaceId/:id", async (c) => {
  const user = c.get("user");
  const workspaceId = c.req.param("workspaceId");
  const id = c.req.param("id");

  const { workspaceMemberId } = await getWorkspacePermissions(workspaceId, user.id);
  if (!workspaceMemberId) {
    throw AppError.Forbidden("You are not a member of this workspace");
  }

  const result = await MemberTodoService.deleteTodo(id, workspaceMemberId);
  return c.json({ success: true, data: result });
});

export default memberTodos;
