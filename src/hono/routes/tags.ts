import { Hono } from "hono";
import { HonoVariables } from "../types";
import { getWorkspaceTags } from "@/data/tag/get-tags";
import { createTag } from "@/actions/tag/create-tag";
import { updateTag } from "@/actions/tag/update-tag";
import { deleteTag } from "@/actions/tag/delete-tag";
import { AppError } from "@/lib/errors/app-error";

const tags = new Hono<{ Variables: HonoVariables }>();

/**
 * GET /api/v1/tags
 */
tags.get("/", async (c) => {
  const workspaceId = c.req.query("workspaceId");
  if (!workspaceId) {
    throw AppError.ValidationError("Missing workspaceId");
  }

  const result = await getWorkspaceTags(workspaceId);
  return c.json({ success: true, tags: result });
});

/**
 * POST /api/v1/tags
 */
tags.post("/", async (c) => {
  const body = await c.req.json();
  const result = await createTag(body);

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
  const result = await updateTag(body);

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

  const result = await deleteTag({ tagId, workspaceId });

  if (!result.success) {
    throw AppError.ValidationError(result.error || "Failed to delete tag");
  }

  return c.json({ success: true, message: "Tag deleted successfully" });
});

export default tags;
