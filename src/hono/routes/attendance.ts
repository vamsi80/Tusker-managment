import { Hono } from "hono";
import { AttendanceService } from "@/server/services/attendance.service";
import { HonoVariables } from "../types";

export const attendanceRouter = new Hono<{ Variables: HonoVariables }>()

.get("/", async (c) => {
    const user = c.get("user");
    const workspaceId = c.req.header("x-workspace-id");

    if (!user || !user.id) return c.json({ success: false, error: "Unauthorized" }, 401);
    if (!workspaceId) return c.json({ success: false, error: "Workspace ID is required" }, 400);

    const startDateStr = c.req.query("startDate");
    const endDateStr = c.req.query("endDate");
    const memberId = c.req.query("memberId");
    const status = c.req.query("status") as any;

    const startDate = startDateStr ? new Date(startDateStr) : undefined;
    const endDate = endDateStr ? new Date(endDateStr) : undefined;

    try {
        const records = await AttendanceService.getWorkspaceAttendance(
            workspaceId, 
            startDate, 
            endDate, 
            { memberId, status }
        );
        return c.json({ success: true, data: records });
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
        const { latitude, longitude, address } = await c.req.json();

        // Geolocation restriction based on user requirement
        if (!latitude || !longitude) {
            return c.json({ success: false, error: "Location is required to check in." }, 400);
        }

        const result = await AttendanceService.checkIn({
            workspaceId,
            userId: user.id,
            latitude,
            longitude,
            address,
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
        const { latitude, longitude, address } = await c.req.json();

        // Geolocation restriction based on user requirement
        if (!latitude || !longitude) {
            return c.json({ success: false, error: "Location is required to check out." }, 400);
        }

        const result = await AttendanceService.checkOut({
            workspaceId,
            userId: user.id,
            latitude,
            longitude,
            address,
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

.patch("/settings", async (c) => {
    const user = c.get("user");
    const workspaceId = c.req.header("x-workspace-id");

    if (!user || !user.id) return c.json({ success: false, error: "Unauthorized" }, 401);
    if (!workspaceId) return c.json({ success: false, error: "Workspace ID is required" }, 400);

    try {
        const body = await c.req.json();
        const result = await AttendanceService.updateSettings(workspaceId, body, user.id);
        return c.json({ success: true, data: result });
    } catch (error: any) {
        return c.json({ success: false, error: error.message }, 400);
    }
});
