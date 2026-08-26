import { Hono } from "hono";
import { HonoVariables } from "../types";
import { TagService } from "@tusker/core/server/services/tag/tag.service";
import { AppError } from "@tusker/core/lib/errors/app-error";

import { ProjectService } from "@tusker/core/server/services/project/project.service";

const tags = new Hono<{ Variables: HonoVariables }>();

/**
 * GET /api/v1/tags
 */
tags.get("/", async (c) => {
  const workspaceId = c.req.query("workspaceId");
  const projectId = c.req.query("projectId");
  if (!workspaceId) {
    throw AppError.ValidationError("Missing workspaceId");
  }

  if (projectId) {
    const result = await ProjectService.getProjectTags(projectId);
    return c.json({ success: true, tags: result });
  }

  const result = await TagService.listWorkspaceTags(workspaceId);
  return c.json({ success: true, tags: result });
});

/**
 * POST /api/v1/tags
 */
tags.post("/", async (c) => {
  const body = await c.req.json();
  const result = await TagService.createTag(c.get("user").id, body);

  if (!result.success) {
    throw AppError.ValidationError(result.error || "Failed to create tag");
  }

  return c.json({ success: true, data: result.data });
});

/**
 * PATCH /api/v1/tags
 */
tags.patch("/", async (c) => {
  const body = await c.req.json();
  const result = await TagService.updateTag(c.get("user").id, body);

  if (!result.success) {
    throw AppError.ValidationError(result.error || "Failed to update tag");
  }

  return c.json({ success: true, data: result.data });
});

/**
 * DELETE /api/v1/tags
 */
tags.delete("/", async (c) => {
  const tagId = c.req.query("tagId");
  const workspaceId = c.req.query("workspaceId");

  if (!tagId || !workspaceId) {
    throw AppError.ValidationError("Missing tagId or workspaceId");
  }

  const result = await TagService.deleteTag(c.get("user").id, { tagId, workspaceId });

  if (!result.success) {
    throw AppError.ValidationError(result.error || "Failed to delete tag");
  }

  return c.json({ success: true, message: "Tag deleted successfully" });
});

export default tags;
