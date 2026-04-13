import { Hono } from "hono";
import { HonoVariables } from "../types";
import { AppError } from "@/lib/errors/app-error";
import { getUserPermissions } from "@/data/user/get-user-permissions";
import { TasksService } from "@/server/services/tasks.service";
import prisma from "@/lib/db";

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
    const { assigneeUserId } = body as { assigneeUserId: string | null };

    // 1. Fetch context + permissions in parallel
    const [subTaskContext, _] = await Promise.all([
        prisma.task.findUnique({
            where: { id: taskId },
            select: {
                id: true,
                parentTaskId: true,
                project: { select: { id: true, workspaceId: true } },
            }
        }),
        Promise.resolve() // placeholder for future parallel work
    ]);

    if (!subTaskContext) {
        throw AppError.NotFound("Subtask not found");
    }

    const permissions = await getUserPermissions(
        subTaskContext.project.workspaceId,
        subTaskContext.project.id,
        user.id
    );

    // 2. Update only the assigneeId via the service (handles permission checks)
    await TasksService.updateTask({
        taskId,
        workspaceId: subTaskContext.project.workspaceId,
        projectId: subTaskContext.project.id,
        userId: user.id,
        permissions,
        data: {
            assigneeUserId: assigneeUserId,
        }
    });

    return c.json({ success: true });
});

export default tasks;
