import { Hono } from "hono";
import prisma from "@/lib/db";
import { HonoVariables } from "../types";
import { AppError } from "@/lib/errors/app-error";
import { TasksService } from "@/server/services/tasks.service";
import { taskSchema, subTaskSchema } from "@/lib/zodSchemas";
import { invalidateTaskMutation } from "@/lib/cache/invalidation";
import { getUserPermissions } from "@/data/user/get-user-permissions";

const tasks = new Hono<{ Variables: HonoVariables }>();

// Skip direct data layer import, use TasksService instead.

/**
 * GET /api/v1/tasks
 * 
 * Consolidated Listing Route for all Task Views.
 * Supports standard and shortened parameters.
 */
tasks.get("/", async (c) => {
  const user = c.get("user");
  const q = c.req.query();

  // 1. Parameter Mapping (Short -> Long)
  const workspaceId = q.w || q.workspaceId;
  let projectId = q.p || q.projectId || undefined;
  if (projectId === "") projectId = undefined;
  const view_mode = q.vm || q.view_mode || "list";
  const limit = parseInt(q.l || q.ps || q.limit || q.pageSize || "50", 10);
  const search = q.q || q.search || undefined;

  if (!workspaceId) throw AppError.ValidationError("Missing workspaceId (w)");

  const parseParam = (key: string, shortKey: string) => {
    const val = q[shortKey] || q[key];
    if (!val) return undefined;
    
    // 1. Try to parse as JSON first (handles ["todo"] or "todo" with quotes)
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed;
      if (parsed === null || parsed === undefined) return undefined;
      return [String(parsed)];
    } catch {
      // 2. Fallback to comma-separated split (handles todo,in_progress)
      return val.split(",").map(v => v.trim()).filter(v => v.length > 0);
    }
  };

  const status = parseParam("status", "s");
  const assigneeId = parseParam("assigneeId", "a");
  const tagId = parseParam("tagId", "t");

  // Dates
  const dueAfter = q.da || q.dueAfter || q.startDate || undefined;
  const dueBefore = q.db || q.dueBefore || q.endDate || undefined;

  // Pagination
  const cursorParam = q.c || q.cursor;
  const cursor = cursorParam ? (cursorParam.startsWith("{") ? JSON.parse(cursorParam) : undefined) : undefined;

  // 2. Build Options based on View Mode
  const opts: any = {
    workspaceId,
    projectId,
    status,
    assigneeId,
    tagId,
    search,
    dueAfter,
    dueBefore,
    cursor,
    limit,
    view_mode: view_mode as any,
    includeSubTasks: (q.subTasks !== "false" && q.sub !== "false"), 
    onlySubtasks: q.onlySub === "true" || q.onlySubtasks === "true",
    filterParentTaskId: q.pt || q.parentTaskId || undefined,
    includeFacets: q.facets === "true",
    hierarchyMode: (q.hm as any) || q.hierarchyMode || undefined,
  };

  // Parse sorts if provided as JSON string
  if (q.sorts) {
    try {
      opts.sorts = JSON.parse(q.sorts);
    } catch {
      // Fallback or ignore
    }
  }

  // Specific overrides for Kanban/Gantt
  if (view_mode === "kanban") {
    opts.groupBy = "status";
    opts.sorts = [{ field: "createdAt", direction: "desc" }];
    opts.onlySubtasks = false; // Allow root tasks in Kanban if they have a status
    opts.includeSubTasks = false; // No nested levels in Kanban
  } else if (view_mode === "gantt") {
    opts.sorts = [{ field: "startDate", direction: "asc" }];
    opts.includeSubTasks = true;
  }

  // 3. Fetch
  const result = await TasksService.listTasks(opts, user.id);
  return c.json({ success: true, data: result });
});

/**
 * POST /api/v1/tasks
 * Create a base task
 */
tasks.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json();

  // Validate
  const validation = taskSchema.safeParse(body);
  if (!validation.success) {
    throw AppError.ValidationError("Invalid task data");
  }

  const { name, projectId } = validation.data;

  // Resolve workspace
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { workspaceId: true },
  });

  if (!project) throw AppError.NotFound("Project not found");

  const permissions = await getUserPermissions(
    project.workspaceId,
    projectId,
    user.id,
  );

  const newTask = await TasksService.createTask({
    name,
    projectId,
    workspaceId: project.workspaceId,
    userId: user.id,
    permissions,
  });

  // Invalidate
  await invalidateTaskMutation({
    projectId,
    workspaceId: project.workspaceId,
    userId: user.id,
    taskId: newTask.id,
  });

  return c.json({ success: true, data: newTask });
});

/**
 * POST /api/v1/tasks/subtask
 * Create a subtask
 */
tasks.post("/subtask", async (c) => {
  const user = c.get("user");
  const body = await c.req.json();

  const validation = subTaskSchema.safeParse(body);
  if (!validation.success) {
    throw AppError.ValidationError("Invalid subtask data");
  }

  const data = validation.data;

  // Resolve workspace context
  const project = await prisma.project.findUnique({
    where: { id: data.projectId },
    select: { workspaceId: true },
  });

  if (!project) throw AppError.NotFound("Project not found");

  const permissions = await getUserPermissions(
    project.workspaceId,
    data.projectId,
    user.id,
  );

  const newSubTask = await TasksService.createSubTask({
    name: data.name,
    description: data.description,
    projectId: data.projectId,
    workspaceId: project.workspaceId,
    parentTaskId: data.parentTaskId,
    userId: user.id,
    permissions,
    assigneeUserId: data.assignee,
    reviewerUserId: data.reviewerId,
    tagId: data.tag,
    startDate: data.startDate,
    dueDate: data.dueDate,
    days: data.days,
    status: data.status as any,
  });

  // Invalidate
  await invalidateTaskMutation({
    projectId: data.projectId,
    workspaceId: data.projectId,
    userId: user.id,
    taskId: newSubTask.id,
  });

  return c.json({ success: true, data: newSubTask });
});

// --- 1. SPECIAL / GLOBAL ROUTES (Must be before :taskId to prevent conflicts) ---

/**
 * POST /api/v1/tasks/bulk
 * Bulk upload tasks and subtasks
 */
tasks.post("/bulk", async (c) => {
  const user = c.get("user");
  const body = await c.req.json();
  const { projectId, tasks: taskData } = body;

  if (!projectId || !taskData) {
    throw AppError.ValidationError("Missing projectId or tasks");
  }

  const { bulkUploadTasksAndSubtasks } = await import(
    "@/actions/task/bulk-create-taskAndSubTask"
  );
  const result = await bulkUploadTasksAndSubtasks({
    projectId,
    tasks: taskData,
  });

  return c.json({
    success: result.status === "success",
    message: result.message,
    data: result.data,
  });
});

/**
 * PATCH /api/v1/tasks/reorder
 * Bulk updates the 'position' of subtasks.
 */
tasks.patch("/reorder", async (c) => {
  const user = c.get("user");
  const body = await c.req.json();
  const { subtaskIds, workspaceId, projectId } = body;

  if (!workspaceId || !projectId || !Array.isArray(subtaskIds)) {
    throw AppError.ValidationError(
      "Missing required fields or subtaskIds is not an array",
    );
  }

  const permissions = await getUserPermissions(workspaceId, projectId, user.id);
  if (!permissions.isWorkspaceAdmin && !permissions.isProjectManager) {
    throw AppError.Forbidden(
      "You don't have permission to reorder tasks in this project.",
    );
  }

  await TasksService.updateSubtasksOrder(subtaskIds);

  const { invalidateProjectSubTasks } = await import(
    "@/lib/cache/invalidation"
  );
  await invalidateProjectSubTasks(projectId);

  return c.json({ success: true, message: "Reordered successfully" });
});

// --- 2. SUB-RESOURCE / SPECIFIC UPDATE ROUTES ---

/**
 * PATCH /api/v1/tasks/:taskId/assignee
 */
tasks.patch("/:taskId/assignee", async (c) => {
  const user = c.get("user");
  const taskId = c.req.param("taskId");

  const body = await c.req.json();
  const { assigneeUserId, explanation, workspaceId, projectId } = body as {
    assigneeUserId: string | null;
    explanation?: string;
    workspaceId: string;
    projectId: string;
  };

  if (!workspaceId || !projectId) {
    throw AppError.ValidationError("Missing workspaceId or projectId in request body");
  }

  const result = await TasksService.updateTaskAssignee({
    taskId,
    assigneeUserId,
    explanation,
    workspaceId,
    projectId,
    userId: user.id,
    userName: (user as any).surname,
  });

  await invalidateTaskMutation({ projectId, workspaceId, userId: user.id, taskId });
  return c.json(result);
});

/**
 * PATCH /api/v1/tasks/:taskId/status
 */
tasks.patch("/:taskId/status", async (c) => {
  const user = c.get("user");
  const taskId = c.req.param("taskId");
  const body = await c.req.json();
  const { newStatus, workspaceId, projectId, comment, attachmentData } = body;

  if (!workspaceId || !projectId || !newStatus) {
    throw AppError.ValidationError("Missing required fields (workspaceId, projectId, newStatus)");
  }

  const permissions = await getUserPermissions(workspaceId, projectId, user.id);
  const result = await TasksService.updateSubTaskStatus({
    subTaskId: taskId,
    newStatus,
    workspaceId,
    projectId,
    userId: user.id,
    permissions,
    comment,
    attachmentData,
  });

  await invalidateTaskMutation({ projectId, workspaceId, userId: user.id, taskId });
  return c.json({ success: true, data: result });
});

/**
 * POST /api/v1/tasks/:taskId/kanban/move
 * Legacy compatibility for Kanban board moves.
 */
tasks.post("/:taskId/kanban/move", async (c) => {
  const user = c.get("user");
  const taskId = c.req.param("taskId");
  const body = await c.req.json();
  const { newStatus, workspaceId, projectId, comment, attachmentData } = body;

  if (!workspaceId || !projectId || !newStatus) {
    throw AppError.ValidationError("Missing required fields");
  }

  const permissions = await getUserPermissions(workspaceId, projectId, user.id);
  const result = await TasksService.updateSubTaskStatus({
    subTaskId: taskId,
    newStatus,
    workspaceId,
    projectId,
    userId: user.id,
    permissions,
    comment,
    attachmentData,
  });

  await invalidateTaskMutation({ projectId, workspaceId, userId: user.id, taskId });
  return c.json({ success: true, data: result });
});

/**
 * POST /api/v1/tasks/:taskId/kanban/pin
 * Pins or unpins a subtask in the Kanban board.
 */
tasks.post("/:taskId/kanban/pin", async (c) => {
  const user = c.get("user");
  const taskId = c.req.param("taskId");
  const body = await c.req.json();
  const { isPinned, workspaceId, projectId } = body;

  if (!workspaceId || !projectId || typeof isPinned !== "boolean") {
    throw AppError.ValidationError("Missing required fields");
  }

  const permissions = await getUserPermissions(workspaceId, projectId, user.id);
  if (!permissions.isWorkspaceAdmin && !permissions.isProjectLead) {
    throw AppError.Forbidden("Only project admins and leads can pin cards.");
  }

  // NOTE: Schema does not currently support isPinned/pinnedAt. 
  // Returning success to avoid UI breakage, matching legacy logic.
  return c.json({
    success: true,
    message: "Pinning is not currently available. Feature coming soon.",
  });
});

/**
 * PATCH /api/v1/tasks/:taskId/dates
 */
tasks.patch("/:taskId/dates", async (c) => {
  const user = c.get("user");
  const taskId = c.req.param("taskId");
  const body = await c.req.json();
  const { startDate, dueDate, workspaceId, projectId } = body;

  if (!workspaceId || !projectId) {
    throw AppError.ValidationError("Missing workspaceId or projectId");
  }

  const permissions = await getUserPermissions(workspaceId, projectId, user.id);
  const updated = await TasksService.updateTaskDates({
    taskId,
    startDate,
    dueDate,
    workspaceId,
    projectId,
    userId: user.id,
    permissions,
  });

  await invalidateTaskMutation({ projectId, workspaceId, userId: user.id, taskId });
  return c.json({ success: true, data: updated });
});

// --- 3. MAIN RESOURCE ROUTES (General Handle) ---

/**
 * PATCH /api/v1/tasks/:taskId
 * Update a task (Parent or Subtask)
 */
tasks.patch("/:taskId", async (c) => {
  const user = c.get("user");
  const taskId = c.req.param("taskId");
  const body = await c.req.json();

  const { workspaceId, projectId, ...data } = body;
  if (!workspaceId || !projectId) {
    throw AppError.ValidationError("Missing workspaceId or projectId");
  }

  const permissions = await getUserPermissions(workspaceId, projectId, user.id);

  const updated = await TasksService.updateTask({
    taskId,
    workspaceId,
    projectId,
    userId: user.id,
    permissions,
    data: {
      ...data,
      assigneeUserId: (data as any).assignee,
      reviewerUserId: (data as any).reviewerId,
      tagId: (data as any).tag,
    },
  });

  await invalidateTaskMutation({
    projectId,
    workspaceId,
    userId: user.id,
    taskId,
  });

  return c.json({ success: true, data: updated });
});

/**
 * DELETE /api/v1/tasks/:taskId
 */
tasks.delete("/:taskId", async (c) => {
  const user = c.get("user");
  const taskId = c.req.param("taskId");
  const { workspaceId, projectId } = await c.req.json();

  if (!workspaceId || !projectId) {
    throw AppError.ValidationError("Missing workspaceId or projectId");
  }

  const permissions = await getUserPermissions(workspaceId, projectId, user.id);

  await TasksService.deleteTask({
    taskId,
    workspaceId,
    projectId,
    userId: user.id,
    permissions,
  });

  // Invalidate
  await invalidateTaskMutation({
    projectId,
    workspaceId,
    userId: user.id,
    taskId,
  });

  return c.json({ success: true, message: "Task deleted" });
});


/**
 * POST /api/v1/tasks/:taskId/dependencies
 *
 * Adds dependencies (supports multiple).
 */
tasks.post("/:taskId/dependencies", async (c) => {
  const user = c.get("user");
  const taskId = c.req.param("taskId");
  const body = await c.req.json();
  const { dependsOnIds, workspaceId, projectId } = body;

  if (
    !workspaceId ||
    !projectId ||
    !dependsOnIds ||
    !Array.isArray(dependsOnIds) ||
    dependsOnIds.length === 0
  ) {
    throw AppError.ValidationError(
      "Missing required fields: workspaceId, projectId, and dependsOnIds (array) are required",
    );
  }

  const permissions = await getUserPermissions(workspaceId, projectId, user.id);

  const result = await TasksService.addDependency({
    subtaskId: taskId,
    dependsOnIds,
    projectId,
    workspaceId,
    permissions,
  });

  // Invalidate
  await invalidateTaskMutation({
    projectId,
    workspaceId,
    userId: user.id,
    taskId,
  });

  return c.json(result);
});

/**
 * DELETE /api/v1/tasks/:taskId/dependencies/:dependsOnId
 *
 * Removes a dependency.
 */
tasks.delete("/:taskId/dependencies/:dependsOnId", async (c) => {
  const user = c.get("user");
  const taskId = c.req.param("taskId");
  const dependsOnId = c.req.param("dependsOnId");
  const body = await c.req.json();
  const { workspaceId, projectId } = body;

  if (!workspaceId || !projectId) {
    throw AppError.ValidationError("Missing required fields");
  }

  const permissions = await getUserPermissions(workspaceId, projectId, user.id);

  const result = await TasksService.removeDependency({
    subtaskId: taskId,
    dependsOnId,
    permissions,
  });

  // Invalidate
  await invalidateTaskMutation({
    projectId,
    workspaceId,
    userId: user.id,
    taskId,
  });

  return c.json(result);
});

/**
 * GET /api/v1/tasks/:parentId/expand
 *
 * Expands a parent task to fetch its subtasks with filtering and pagination.
 */
tasks.get("/:parentId/expand", async (c) => {
  const user = c.get("user");
  const parentId = c.req.param("parentId");
  const q = c.req.query();

  const workspaceId = q.w || q.workspaceId;
  if (!workspaceId) throw AppError.ValidationError("Missing workspaceId (w)");

  const projectId = q.p || q.projectId;
  const viewMode = q.vm || q.viewMode || "list";
  const pageSize = parseInt(q.ps || q.pageSize || "30", 10);

  const parseParam = (key: string, shortKey: string) => {
    const val = q[shortKey] || q[key];
    if (!val) return undefined;
    try {
      return JSON.parse(val);
    } catch {
      return val.split(",");
    }
  };

  const filters: any = {
    status: parseParam("status", "s"),
    assigneeId: parseParam("assigneeId", "a"),
    tagId: parseParam("tagId", "t"),
    search: q.q || q.search,
  };

  const da = q.da || q.dueAfter;
  if (da && da !== "undefined" && da !== "null")
    filters.dueAfter = new Date(da);

  const db = q.db || q.dueBefore;
  if (db && db !== "undefined" && db !== "null")
    filters.dueBefore = new Date(db);

  const data = await TasksService.expandSubtasks({
    parentId,
    workspaceId,
    projectId,
    filters,
    pageSize,
    viewMode,
    userId: user.id,
  });

  return c.json({ success: true, ...data });
});

/**
 * GET /api/v1/tasks/expansion/batch
 * 
 * Expands multiple parent tasks in one single request.
 * Query Param: ids (comma-separated list of parent task IDs)
 */
tasks.get("/expansion/batch", async (c) => {
  const user = c.get("user");
  const q = c.req.query();

  const workspaceId = q.w || q.workspaceId;
  if (!workspaceId) throw AppError.ValidationError("Missing workspaceId (w)");

  const idsParam = q.ids;
  if (!idsParam) throw AppError.ValidationError("Missing ids parameter");
  
  const parentIds = idsParam.split(",");
  const projectId = q.p || q.projectId;
  const viewMode = q.vm || q.viewMode || "list";
  const pageSize = parseInt(q.ps || q.pageSize || "30", 10);

  const parseParam = (key: string, shortKey: string) => {
    const val = q[shortKey] || q[key];
    if (!val) return undefined;
    try {
      return JSON.parse(val);
    } catch {
      return val.split(",");
    }
  };

  const filters: any = {
    status: parseParam("status", "s"),
    assigneeId: parseParam("assigneeId", "a"),
    tagId: parseParam("tagId", "t"),
    search: q.q || q.search,
  };

  const da = q.da || q.dueAfter;
  if (da && da !== "undefined" && da !== "null")
    filters.dueAfter = new Date(da);

  const db = q.db || q.dueBefore;
  if (db && db !== "undefined" && db !== "null")
    filters.dueBefore = new Date(db);

  // Directly call the batch service
  const results = await TasksService.expandSubtasksBatch({
    parentIds,
    workspaceId,
    projectId,
    filters,
    pageSize,
    viewMode,
    userId: user.id
  });

  return c.json({ success: true, data: results });
});

export default tasks;
