import { Hono } from "hono";
import { HonoVariables } from "../types";
import { AppError } from "@/lib/errors/app-error";
import { TasksService } from "@/server/services/tasks.service";

const tasks = new Hono<{ Variables: HonoVariables }>();

/**
 * PATCH /api/v1/tasks/:taskId/assignee
 * 
 * Surgically updates ONLY the assignee of a subtask.
 * Using a REST API route instead of a Server Action prevents Next.js
 * from triggering an RSC re-render, keeping the response payload tiny.
 * 
 * Body: { assigneeUserId: string | null }
 * Returns: { success: true } (~50 bytes)
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
