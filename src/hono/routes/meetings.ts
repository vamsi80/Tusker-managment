import { Hono } from "hono";
import { z } from "zod";
import { HonoVariables } from "../types";
import { MeetingService } from "@/server/services/meeting.service";
import { AppError } from "@/lib/errors/app-error";

const meetings = new Hono<{ Variables: HonoVariables }>();

const createMeetingSchema = z.object({
  workspaceId: z.string().min(1, "Workspace ID is required"),
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().optional().nullable(),
  startTime: z.string().datetime().or(z.string()),
  endTime: z.string().datetime().or(z.string()),
  location: z.string().max(200).optional().nullable(),
  meetingUrl: z.string().url().or(z.string()).optional().nullable(),
  type: z.enum(["INTERNAL", "CLIENT", "PROJECT_REVIEW", "ONE_ON_ONE", "GENERAL"]).optional(),
  status: z.enum(["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).optional(),
  color: z.string().optional(),
  reminderMinutes: z.number().int().nonnegative().optional(),
  isAllDay: z.boolean().optional(),
  projectId: z.string().optional().nullable(),
  attendeeUserIds: z.array(z.string()).optional(),
});

const updateMeetingSchema = createMeetingSchema.partial().omit({ workspaceId: true });

const rsvpSchema = z.object({
  status: z.enum(["INVITED", "ACCEPTED", "DECLINED", "TENTATIVE"]),
});

/**
 * GET /api/v1/meetings
 */
meetings.get("/", async (c) => {
  const workspaceId = c.req.query("workspaceId");
  if (!workspaceId) {
    throw AppError.ValidationError("Missing workspaceId parameter");
  }

  const startDate = c.req.query("startDate");
  const endDate = c.req.query("endDate");
  const projectId = c.req.query("projectId");
  const type = c.req.query("type") as any;
  const includeLayers = c.req.query("includeLayers") === "true";

  const result = await MeetingService.getMeetings(workspaceId, {
    startDate,
    endDate,
    projectId,
    type,
    includeLayers,
  });

  return c.json({ success: true, data: result });
});

/**
 * POST /api/v1/meetings
 */
meetings.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json();
  const parsed = createMeetingSchema.safeParse(body);

  if (!parsed.success) {
    const errorMsg = parsed.error.issues.map((i) => i.message).join(", ");
    throw AppError.ValidationError(errorMsg);
  }

  const { workspaceId, ...meetingData } = parsed.data;
  const result = await MeetingService.createMeeting(workspaceId, user.id, meetingData as any);

  return c.json({ success: true, data: result }, 201);
});

/**
 * PATCH /api/v1/meetings/:id
 */
meetings.patch("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const workspaceId = c.req.query("workspaceId") || (await c.req.json().then((b) => b.workspaceId).catch(() => null));

  if (!workspaceId) {
    throw AppError.ValidationError("Missing workspaceId");
  }

  const body = await c.req.json();
  const parsed = updateMeetingSchema.safeParse(body);

  if (!parsed.success) {
    const errorMsg = parsed.error.issues.map((i) => i.message).join(", ");
    throw AppError.ValidationError(errorMsg);
  }

  const result = await MeetingService.updateMeeting(id, workspaceId, user.id, parsed.data as any);
  return c.json({ success: true, data: result });
});

/**
 * DELETE /api/v1/meetings/:id
 */
meetings.delete("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const workspaceId = c.req.query("workspaceId");

  if (!workspaceId) {
    throw AppError.ValidationError("Missing workspaceId query parameter");
  }

  const result = await MeetingService.deleteMeeting(id, workspaceId, user.id);
  return c.json({ success: true, data: result });
});

/**
 * POST /api/v1/meetings/:id/rsvp
 */
meetings.post("/:id/rsvp", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.json();
  const parsed = rsvpSchema.safeParse(body);

  if (!parsed.success) {
    throw AppError.ValidationError("Invalid RSVP status");
  }

  const result = await MeetingService.rsvpMeeting(id, user.id, parsed.data.status);
  return c.json({ success: true, data: result });
});

export default meetings;
