import { Hono } from "hono";
import { HonoVariables } from "../types";
import { getProjectReviewers } from "@/actions/project/get-project-reviewers";
import { AppError } from "@/lib/errors/app-error";

const projects = new Hono<{ Variables: HonoVariables }>();

/**
 * GET /api/v1/projects/:projectId/reviewers
 * Fetch all available reviewers for a project.
 */
projects.get("/:projectId/reviewers", async (c) => {
  const projectId = c.req.param("projectId");
  if (!projectId) {
    throw AppError.ValidationError("Project ID is required");
  }

  try {
    const reviewers = await getProjectReviewers(projectId);
    return c.json(reviewers);
  } catch (error) {
    console.error("[HONO_PROJECT_REVIEWERS_GET]", error);
    throw AppError.Internal("Failed to fetch project reviewers");
  }
});

export default projects;
