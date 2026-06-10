import { Hono } from "hono";
import { Context } from "hono";
import { HonoVariables } from "../types";
import { TasksService } from "@/server/services/task/tasks.service";

/**
 * RESTful task view endpoints matching the frontend route segments.
 *
 * GET /api/v1/workspaces/:workspaceId/tasks/list|kanban|gantt
 * GET /api/v1/workspaces/:workspaceId/projects/:projectId/tasks/list|kanban|gantt
 *
 * View-specific defaults are baked in — clients only pass clean params:
 * limit, cursor, facets, search, status, assignee, tag, sorts, sub
 */
const taskViews = new Hono<{ Variables: HonoVariables }>();

type ViewMode = "list" | "kanban" | "gantt";

function parseList(val?: string) {
    if (!val) return undefined;
    try {
        const parsed = JSON.parse(val);
        if (Array.isArray(parsed)) return parsed;
        if (parsed === null || parsed === undefined) return undefined;
        return [String(parsed)];
    } catch {
        return val
            .split(",")
            .map((v) => v.trim())
            .filter((v) => v.length > 0);
    }
}

function buildViewOpts(c: Context<{ Variables: HonoVariables }>, view_mode: ViewMode) {
    const { workspaceId, projectId } = c.req.param() as { workspaceId: string; projectId?: string };
    const q = c.req.query();
    const cursorParam = q.cursor;

    const opts: any = {
        workspaceId,
        // Path param wins; `project`/`projectId` query params allow a project filter at workspace level
        projectId: projectId || q.project || q.projectId || undefined,
        view_mode,
        limit: parseInt(q.limit || "25", 10),
        cursor: cursorParam?.startsWith("{") ? JSON.parse(cursorParam) : undefined,
        search: q.search || undefined,
        status: parseList(q.status),
        assigneeId: parseList(q.assignee || q.assigneeId),
        tagId: parseList(q.tag || q.tagId),
        dueAfter: q.dueAfter || q.startDate || undefined,
        dueBefore: q.dueBefore || q.endDate || undefined,
        dueDateType: q.dueDateType || q.dueDateFilter || undefined,
        filterParentTaskId: q.parent || q.parentTaskId || undefined,
        onlySubtasks: q.onlySub === "true",
        extraFields: parseList(q.fields),
        includeFacets: q.facets === "true",
        hierarchyMode: "parents",
        includeSubTasks: q.sub === "true",
    };

    if (q.sorts) {
        try {
            opts.sorts = JSON.parse(q.sorts);
        } catch {
            // ignore malformed sorts
        }
    }

    if (view_mode === "kanban") {
        // Same overrides as the legacy /tasks handler applies for vm=kanban
        opts.groupBy = "status";
        opts.sorts = [];
        opts.excludeParents = true;
        opts.onlySubtasks = false;
        opts.hierarchyMode = undefined;
        opts.includeSubTasks = q.sub === "true";
        opts.limit = parseInt(q.limit || "50", 10);
    }

    return opts;
}

const handler = (view: ViewMode) => async (c: Context<{ Variables: HonoVariables }>) => {
    const user = c.get("user");
    const result = await TasksService.listTasks(buildViewOpts(c, view), user.id);
    return c.json({ success: true, data: result });
};

// Workspace-level views
taskViews.get("/:workspaceId/tasks/list", handler("list"));
taskViews.get("/:workspaceId/tasks/kanban", handler("kanban"));
taskViews.get("/:workspaceId/tasks/gantt", handler("gantt"));

// Project-level views
taskViews.get("/:workspaceId/projects/:projectId/tasks/list", handler("list"));
taskViews.get("/:workspaceId/projects/:projectId/tasks/kanban", handler("kanban"));
taskViews.get("/:workspaceId/projects/:projectId/tasks/gantt", handler("gantt"));

export default taskViews;
