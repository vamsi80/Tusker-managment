import { Hono } from "hono";
import prisma from "@/lib/db";
import { AttendanceService } from "@/server/services/attendance.service";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";
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

    // Adjust for IST if dates are provided to match the @db.Date storage logic
    const normalizedStart = startDate ? new Date(startDate.getTime() + (5.5 * 60 * 60 * 1000)) : undefined;
    if (normalizedStart) normalizedStart.setUTCHours(0, 0, 0, 0);
    
    const normalizedEnd = endDate ? new Date(endDate.getTime() + (5.5 * 60 * 60 * 1000)) : undefined;
    if (normalizedEnd) normalizedEnd.setUTCHours(23, 59, 59, 999);

    try {
        const { workspaceRole, workspaceMemberId } = await getWorkspacePermissions(workspaceId, user.id);
        
        // If user is a MEMBER, they can ONLY see their own records.
        // ADMIN, OWNER, and MANAGER can see all records or filter as they wish.
        let effectiveMemberId = memberId;
        if (workspaceRole === "MEMBER") {
            effectiveMemberId = workspaceMemberId;
        }

        const records = await AttendanceService.getWorkspaceAttendance(
            workspaceId, 
            normalizedStart, 
            normalizedEnd, 
            { memberId: effectiveMemberId, status }
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
            const { workspaceRole, workspaceMemberId } = await getWorkspacePermissions(workspaceId, user.id);
            
            const where: any = { workspaceId };
            if (workspaceRole === "MEMBER") {
                where.workspaceMemberId = workspaceMemberId;
            }

            const leaves = await (prisma as any).leave_request.findMany({
                where,
                include: {
                    WorkspaceMember: {
                        select: {
                            id: true,
                            reportToId: true,
                            casualLeaveBalance: true,
                            sickLeaveBalance: true,
                            user: {
                                select: {
                                    name: true,
                                    surname: true,
                                    email: true,
                                    image: true,
                                }
                            }
                        }
                    }
                },
                orderBy: { createdAt: "desc" }
            });
            return c.json({ success: true, data: leaves });
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
            const result = await AttendanceService.createLeaveRequest({
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
            const { isWorkspaceAdmin } = await getWorkspacePermissions(workspaceId, user.id);
            if (!isWorkspaceAdmin) {
                return c.json({ success: false, error: "Only admins can approve/reject leaves" }, 403);
            }

            const { status } = await c.req.json();
            const result = await AttendanceService.updateLeaveStatus(id, status, user.id, workspaceId);
            return c.json({ success: true, data: result });
        } catch (error: any) {
            return c.json({ success: false, error: error.message }, 400);
        }
    });
