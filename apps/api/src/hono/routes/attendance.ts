import { Hono } from "hono";
import type { StatusCode } from "hono/utils/http-status";
import { AttendanceService } from "@/server/services/attendance";
import { LeaveService } from "@/server/services/leave";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";
import { HonoVariables } from "../types";
import type { AttendanceStatus } from "@/generated/prisma";
import { getDb } from "@/lib/registry";

const DEFAULT_ATTENDANCE_SETTINGS = {
    lateThreshold: "21:30",
    overtimeThreshold: "07:00",
    halfDayThreshold: "23:00",
    shiftStartTime: "21:30",
    shiftEndTime: "07:00",
    sickLeaveLimit: 12,
    casualLeaveAccrualDays: 20,
    publicHolidays: [] as any[],
    attendanceLocations: [] as any[],
};

export const attendanceRouter = new Hono<{ Variables: HonoVariables }>()

    .get("/", async (c) => {
        const user = c.get("user");
        const workspaceId = c.req.header("x-workspace-id");

        if (!user || !user.id) return c.json({ success: false, error: "Unauthorized" }, 401);
        if (!workspaceId) return c.json({ success: false, error: "Workspace ID is required" }, 400);

        const startDateStr = c.req.query("startDate");
        const endDateStr = c.req.query("endDate");
        const memberId = c.req.query("memberId");
        const statusRaw = c.req.query("status");
        const status = statusRaw as AttendanceStatus | undefined;

        const startDate = startDateStr ? new Date(startDateStr) : undefined;
        const endDate = endDateStr ? new Date(endDateStr) : undefined;

        // Adjust for IST if dates are provided to match the @db.Date storage logic
        const normalizedStart = startDate ? new Date(startDate.getTime() + (5.5 * 60 * 60 * 1000)) : undefined;
        if (normalizedStart) normalizedStart.setUTCHours(0, 0, 0, 0);

        const normalizedEnd = endDate ? new Date(endDate.getTime() + (5.5 * 60 * 60 * 1000)) : undefined;
        if (normalizedEnd) normalizedEnd.setUTCHours(23, 59, 59, 999);

        try {
            const page = parseInt(c.req.query("page") || "1");
            const pageSize = parseInt(c.req.query("pageSize") || "10");
            const search = c.req.query("search");

            const result = await AttendanceService.getWorkspaceAttendance(
                workspaceId,
                user.id,
                normalizedStart,
                normalizedEnd,
                { memberId, status, search },
                page,
                pageSize
            );
            return c.json({ success: true, ...result });
        } catch (error: any) {
            return c.json({ success: false, error: error.message }, 400);
        }
    })

    .get("/today", async (c) => {
        const user = c.get("user");
        const workspaceId = c.req.header("x-workspace-id");

        if (!user || !user.id) return c.json({ success: false, error: "Unauthorized" }, 401);
        if (!workspaceId) return c.json({ success: false, error: "Workspace ID is required" }, 400);

        try {
            const record = await AttendanceService.getTodayAttendance(workspaceId, user.id);
            return c.json({ success: true, data: record });
        } catch (error: any) {
            return c.json({ success: false, error: error.message }, 400);
        }
    })

    .post("/check-in", async (c) => {
        const user = c.get("user");
        const workspaceId = c.req.header("x-workspace-id");

        if (!user || !user.id) return c.json({ success: false, error: "Unauthorized" }, 401);
        if (!workspaceId) return c.json({ success: false, error: "Workspace ID is required" }, 400);

        try {
            const { latitude, longitude, accuracy, address, networkLocation, notes } = await c.req.json();
            if (!latitude || !longitude) {
                return c.json({ success: false, error: "Location is required to check in." }, 400);
            }

            const result = await AttendanceService.checkIn({
                workspaceId,
                userId: user.id,
                latitude,
                longitude,
                accuracy: accuracy ? parseFloat(accuracy) : undefined,
                address,
                networkLocation,
                notes,
            });
            return c.json({ success: true, data: result });
        } catch (error: any) {
            return c.json({ success: false, error: error.message }, (parseInt(error.statusCode) || 400) as any);
        }
    })

    .post("/check-out", async (c) => {
        const user = c.get("user");
        const workspaceId = c.req.header("x-workspace-id");

        if (!user || !user.id) return c.json({ success: false, error: "Unauthorized" }, 401);
        if (!workspaceId) return c.json({ success: false, error: "Workspace ID is required" }, 400);

        try {
            const { latitude, longitude, accuracy, address, notes } = await c.req.json();
            if (!latitude || !longitude) {
                return c.json({ success: false, error: "Location is required to check out." }, 400);
            }

            const result = await AttendanceService.checkOut({
                workspaceId,
                userId: user.id,
                latitude,
                longitude,
                accuracy: accuracy ? parseFloat(accuracy) : undefined,
                address,
                notes,
            });
            return c.json({ success: true, data: result });
        } catch (error: any) {
            return c.json({ success: false, error: error.message }, (parseInt(error.statusCode) || 400) as any);
        }
    })

    .post("/reconcile", async (c) => {
        const user = c.get("user");
        const workspaceId = c.req.header("x-workspace-id");

        if (!user || !user.id) return c.json({ success: false, error: "Unauthorized" }, 401);
        if (!workspaceId) return c.json({ success: false, error: "Workspace ID is required" }, 400);

        try {
            const { date } = await c.req.json().catch(() => ({ date: null }));
            const targetDate = date ? new Date(date) : new Date();
            const result = await AttendanceService.reconcileAttendance(workspaceId, targetDate);
            return c.json({ success: true, data: result });
        } catch (error: any) {
            return c.json({ success: false, error: error.message }, 400);
        }
    })

    .get("/settings", async (c) => {
        const user = c.get("user");
        const workspaceId = c.req.header("x-workspace-id");

        if (!user || !user.id) return c.json({ success: false, error: "Unauthorized" }, 401);
        if (!workspaceId) return c.json({ success: false, error: "Workspace ID is required" }, 400);

        try {
            const db = getDb();
            const [workspaceResult, holidays, locations] = await Promise.all([
                db.$queryRawUnsafe<any[]>(
                    `SELECT "lateThreshold", "overtimeThreshold", "halfDayThreshold", "shiftStartTime", "shiftEndTime", "sickLeaveLimit", "casualLeaveAccrualDays"
                     FROM "public"."Workspace"
                     WHERE "id" = $1
                     LIMIT 1`,
                    workspaceId
                ),
                db.public_holiday.findMany({ where: { workspaceId }, orderBy: { date: "asc" } }),
                db.attendanceLocation.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" } }),
            ]);

            const ws = workspaceResult[0];
            if (!ws) return c.json({ success: true, data: DEFAULT_ATTENDANCE_SETTINGS });

            return c.json({
                success: true,
                data: {
                    lateThreshold:          ws.lateThreshold          || DEFAULT_ATTENDANCE_SETTINGS.lateThreshold,
                    overtimeThreshold:      ws.overtimeThreshold      || DEFAULT_ATTENDANCE_SETTINGS.overtimeThreshold,
                    halfDayThreshold:       ws.halfDayThreshold       || DEFAULT_ATTENDANCE_SETTINGS.halfDayThreshold,
                    shiftStartTime:         ws.shiftStartTime         || DEFAULT_ATTENDANCE_SETTINGS.shiftStartTime,
                    shiftEndTime:           ws.shiftEndTime           || DEFAULT_ATTENDANCE_SETTINGS.shiftEndTime,
                    sickLeaveLimit:         ws.sickLeaveLimit         ?? DEFAULT_ATTENDANCE_SETTINGS.sickLeaveLimit,
                    casualLeaveAccrualDays: ws.casualLeaveAccrualDays ?? DEFAULT_ATTENDANCE_SETTINGS.casualLeaveAccrualDays,
                    publicHolidays:         holidays,
                    attendanceLocations:    locations || [],
                },
            });
        } catch (error: any) {
            return c.json({ success: false, error: error.message }, 400);
        }
    })

    .patch("/settings", async (c) => {
        const user = c.get("user");
        const workspaceId = c.req.header("x-workspace-id");

        if (!user || !user.id) return c.json({ success: false, error: "Unauthorized" }, 401);
        if (!workspaceId) return c.json({ success: false, error: "Workspace ID is required" }, 400);

        try {
            const { isWorkspaceAdmin } = await getWorkspacePermissions(workspaceId, user.id);
            if (!isWorkspaceAdmin) {
                return c.json({ success: false, error: "Only workspace admins can update settings" }, 403);
            }

            const body = await c.req.json();
            const result = await AttendanceService.updateSettings(workspaceId, body, user.id);
            return c.json({ success: true, data: result });
        } catch (error: any) {
            return c.json({ success: false, error: error.message }, 400);
        }
    })

    .patch("/:id", async (c) => {
        const user = c.get("user");
        const workspaceId = c.req.header("x-workspace-id");
        const id = c.req.param("id");

        if (!user || !user.id) return c.json({ success: false, error: "Unauthorized" }, 401);
        if (!workspaceId) return c.json({ success: false, error: "Workspace ID is required" }, 400);

        try {
            const body = await c.req.json();
            const result = await AttendanceService.updateAttendance(id, body, user.id, workspaceId);
            return c.json({ success: true, data: result });
        } catch (error: any) {
            return c.json({ success: false, error: error.message }, 400);
        }
    })

    .get("/leave-request", async (c) => {
        const user = c.get("user");
        const workspaceId = c.req.header("x-workspace-id");

        if (!user || !user.id) return c.json({ success: false, error: "Unauthorized" }, 401);
        if (!workspaceId) return c.json({ success: false, error: "Workspace ID is required" }, 400);

        try {
            const page = parseInt(c.req.query("page") || "1");
            const pageSize = parseInt(c.req.query("pageSize") || "10");
            const search = c.req.query("search");

            const { leaves, totalCount } = await LeaveService.getWorkspaceLeaves(workspaceId, user.id, page, pageSize, search);
            return c.json({ success: true, data: leaves, totalCount });
        } catch (error: any) {
            return c.json({ success: false, error: error.message }, 400);
        }
    })

    .get("/leave-balance", async (c) => {
        const user = c.get("user");
        const workspaceId = c.req.header("x-workspace-id");

        if (!user || !user.id) return c.json({ success: false, error: "Unauthorized" }, 401);
        if (!workspaceId) return c.json({ success: false, error: "Workspace ID is required" }, 400);

        try {
            const result = await LeaveService.getMemberBalances(workspaceId, user.id);
            return c.json({ success: true, data: result });
        } catch (error: any) {
            return c.json({ success: false, error: error.message }, 400);
        }
    })

    .post("/leave-request", async (c) => {
        const user = c.get("user");
        const workspaceId = c.req.header("x-workspace-id");

        if (!user || !user.id) return c.json({ success: false, error: "Unauthorized" }, 401);
        if (!workspaceId) return c.json({ success: false, error: "Workspace ID is required" }, 400);

        try {
            const { startDate, endDate, reason, type } = await c.req.json();
            const result = await LeaveService.createLeaveRequest({
                workspaceId,
                userId: user.id,
                startDate: new Date(startDate),
                endDate: new Date(endDate),
                reason,
                type,
            });
            return c.json({ success: true, data: result });
        } catch (error: any) {
            return c.json({ success: false, error: error.message }, 400);
        }
    })

    .patch("/leave-request/:id", async (c) => {
        const user = c.get("user");
        const workspaceId = c.req.header("x-workspace-id");
        const id = c.req.param("id");

        if (!user || !user.id) return c.json({ success: false, error: "Unauthorized" }, 401);
        if (!workspaceId) return c.json({ success: false, error: "Workspace ID is required" }, 400);

        try {
            // Let LeaveService handle the authorization logic (Admins or Reporting Managers)

            const { status } = await c.req.json();
            const result = await LeaveService.updateLeaveStatus({
                id, 
                status, 
                actorId: user.id, 
                workspaceId
            });
            return c.json({ success: true, data: result });
        } catch (error: any) {
            return c.json({ success: false, error: error.message }, 400);
        }
    });
