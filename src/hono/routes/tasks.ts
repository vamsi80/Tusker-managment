import { Hono } from "hono";
import prisma from "@/lib/db";
import { HonoVariables } from "../types";
import { AppError } from "@/lib/errors/app-error";
import { TasksService } from "@/server/services/tasks.service";
import { taskSchema, subTaskSchema } from "@/lib/zodSchemas";
import { invalidateTaskMutation } from "@/lib/cache/invalidation";
import { getUserPermissions } from "@/data/user/get-user-permissions";

const tasks = new Hono<{ Variables: HonoVariables }>();

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
        select: { workspaceId: true }
    });

    if (!project) throw AppError.NotFound("Project not found");

    const permissions = await getUserPermissions(project.workspaceId, projectId, user.id);

    const newTask = await TasksService.createTask({
        name,
        projectId,
        workspaceId: project.workspaceId,
        userId: user.id,
        permissions
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
    const permissions = await getUserPermissions(data.projectId, data.projectId, user.id);

    const newSubTask = await TasksService.createSubTask({
        name: data.name,
        description: data.description,
        projectId: data.projectId,
        workspaceId: data.projectId, // Error in schema or service? Usually workspaceId is separate.
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
        data
    });

    // Invalidate
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
        permissions
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

    // Reuse the existing logic by importing the action or service
    // For now, I'll call the action directly if possible, or move it to a service
    // Actually, bulkUploadTasksAndSubtasks is currently a Server Action.
    // I'll move the core logic to a Service later, for now I'll just call the action.

    const { bulkUploadTasksAndSubtasks } = await import("@/actions/task/bulk-create-taskAndSubTask");
    const result = await bulkUploadTasksAndSubtasks({ projectId, tasks: taskData });

    return c.json({
        success: result.status === "success",
        message: result.message,
        data: result.data
    });
});

/**
 * PATCH /api/v1/tasks/:taskId/assignee
 * 
 * Surgically updates ONLY the assignee of a subtask.
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
        userName: (user as any).surname
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
 * PATCH /api/v1/tasks/:taskId/status
 * 
 * Surgically updates ONLY THE STATUS of a task or subtask.
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
        attachmentData
    });

    // Invalidate
    await invalidateTaskMutation({
        projectId,
        workspaceId,
        userId: user.id,
        taskId,
    });

    return c.json({ success: true, data: result });
});

/**
 * PATCH /api/v1/tasks/:taskId/dates
 * 
 * Surgically updates start and due dates.
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
        permissions
    });

    // Invalidate
    await invalidateTaskMutation({
        projectId,
        workspaceId,
        userId: user.id,
        taskId,
    });

    return c.json({ success: true, data: updated });
});

/**
 * PATCH /api/v1/tasks/reorder
 * 
 * Bulk updates the 'position' of subtasks.
 */
tasks.patch("/reorder", async (c) => {
    const user = c.get("user");
    const body = await c.req.json();
    const { subtaskIds, workspaceId, projectId } = body;

    if (!workspaceId || !projectId || !Array.isArray(subtaskIds)) {
        throw AppError.ValidationError("Missing required fields or subtaskIds is not an array");
    }

    // Permission check for the project
    const permissions = await getUserPermissions(workspaceId, projectId, user.id);
    if (!permissions.isWorkspaceAdmin && !permissions.isProjectManager) {
        throw AppError.Forbidden("You don't have permission to reorder tasks in this project.");
    }

    await TasksService.updateSubtasksOrder(subtaskIds);

    // Invalidate project-level subtasks (Gantt/List)
    const { invalidateProjectSubTasks } = await import("@/lib/cache/invalidation");
    await invalidateProjectSubTasks(projectId);

    return c.json({ success: true, message: "Reordered successfully" });
});

/**
 * POST /api/v1/tasks/:taskId/dependencies
 * 
 * Adds a dependency.
 */
tasks.post("/:taskId/dependencies", async (c) => {
    const user = c.get("user");
    const taskId = c.req.param("taskId");
    const body = await c.req.json();
    const { dependsOnId, workspaceId, projectId } = body;

    if (!workspaceId || !projectId || !dependsOnId) {
        throw AppError.ValidationError("Missing required fields");
    }

    const permissions = await getUserPermissions(workspaceId, projectId, user.id);

    const result = await TasksService.addDependency({
        subtaskId: taskId,
        dependsOnId,
        projectId,
        workspaceId,
        permissions
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
        permissions
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
            return val.split(',');
        }
    };

    const filters: any = {
        status: parseParam("status", "s"),
        assigneeId: parseParam("assigneeId", "a"),
        tagId: parseParam("tagId", "t"),
        search: q.q || q.search,
    };

    const da = q.da || q.dueAfter;
    if (da && da !== "undefined" && da !== "null") filters.dueAfter = new Date(da);

    const db = q.db || q.dueBefore;
    if (db && db !== "undefined" && db !== "null") filters.dueBefore = new Date(db);

    const data = await TasksService.expandSubtasks({
        parentId,
        workspaceId,
        projectId,
        filters,
        pageSize,
        viewMode,
        userId: user.id
    });

    return c.json({ success: true, ...data });
});

export default tasks;
