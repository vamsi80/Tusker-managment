import { Hono } from "hono";
import { randomUUID } from "crypto";
import { HonoVariables } from "../types";
import { AppError } from "@tusker/core/lib/errors/app-error";
import { fetchUserPermissions } from "@tusker/core/permissions";
import { TaskRepository } from "@tusker/core/server/services/task/task.repository";
import { presignUpload, presignDownload, isStorageConfigured } from "@tusker/core/lib/storage/s3";
import { presignUploadSchema } from "@tusker/core/lib/zodSchemas";
import { validateAttachment, extensionOf, attachmentKeyPrefix, parseAttachmentKey } from "@tusker/core/lib/attachments";

const uploads = new Hono<{ Variables: HonoVariables }>();

/** Every attachment is scoped to a task; the caller must be a member of that task's workspace. */
async function authorizeTask(workspaceId: string, taskId: string, userId: string, projectIdHint?: string) {
    const task = (await TaskRepository.findById(taskId, { id: true, projectId: true, workspaceId: true })) as any;
    if (!task) throw AppError.NotFound("Task not found");
    if (task.workspaceId !== workspaceId) throw AppError.Forbidden("Task does not belong to this workspace");
    if (projectIdHint && task.projectId !== projectIdHint) {
        throw AppError.Forbidden("Task does not belong to this project");
    }

    const permissions = await fetchUserPermissions(workspaceId, task.projectId, userId);
    if (!permissions.workspaceMemberId) throw AppError.Forbidden("You do not have access to this workspace");
    return { task, permissions };
}

/**
 * POST /api/v1/uploads/presign
 * Returns a short-lived URL the browser PUTs the file to directly, so large
 * media never passes through the server.
 */
uploads.post("/presign", async (c) => {
    if (!isStorageConfigured()) {
        throw AppError.ValidationError("File uploads are not configured on this server.");
    }

    const user = c.get("user");
    const parsed = presignUploadSchema.safeParse(await c.req.json());
    if (!parsed.success) throw AppError.ValidationError(parsed.error.issues[0]?.message || "Invalid upload request");

    const { workspaceId, projectId, taskId, name, mime, size } = parsed.data;

    // The client pre-checks too, but it can lie — this is the check that counts.
    const check = validateAttachment({ name, size, type: mime });
    if (!check.ok) throw AppError.ValidationError(check.error);

    await authorizeTask(workspaceId, taskId, user.id, projectId);

    const ext = extensionOf(name);
    const key = `${attachmentKeyPrefix(workspaceId, taskId)}${randomUUID()}${ext ? `.${ext}` : ""}`;
    const contentType = mime || "application/octet-stream";
    const url = await presignUpload(key, contentType);

    return c.json({ success: true, data: { url, key, contentType } });
});

/**
 * GET /api/v1/uploads/file?key=...&download=1
 * Authorizes the viewer, then redirects to a short-lived signed URL.
 * The bucket itself stays private — no permanent public object URLs exist.
 */
uploads.get("/file", async (c) => {
    if (!isStorageConfigured()) throw AppError.NotFound("File not found");

    const user = c.get("user");
    const key = c.req.query("key");
    if (!key) throw AppError.ValidationError("Missing key");

    const parsed = parseAttachmentKey(key);
    if (!parsed) throw AppError.ValidationError("Invalid key");

    await authorizeTask(parsed.workspaceId, parsed.taskId, user.id);

    const url = await presignDownload(key, {
        download: c.req.query("download") === "1",
        filename: c.req.query("name") || undefined,
    });
    return c.redirect(url, 302);
});

export default uploads;
