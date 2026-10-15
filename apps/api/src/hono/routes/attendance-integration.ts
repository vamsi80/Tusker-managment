import { Hono } from "hono";
import { timingSafeEqual } from "crypto";
import { AttendanceService } from "@tusker/core/server/services/attendance/index";
import { AttendanceStatus } from "@tusker/db";
import { getISTDateOnly, toDateOnly } from "@tusker/core/lib/date-utils";

/**
 * Attendance integration API (machine-to-machine).
 *
 * A day's present / late / absent headcounts for one workspace (present
 * includes late; late is the subset that arrived late), for external
 * dashboards (the Flight Garden art piece reads it). Authenticated by the
 * shared ATTENDANCE_INTEGRATION_API_KEY instead of a user session, so it must
 * be mounted BEFORE authMiddleware in hono/index.ts — same pattern as
 * routes/kiosk.ts.
 *
 * GET /api/v1/integrations/attendance/summary
 *       ?workspaceId=<id>     (required; or the x-workspace-id header)
 *       &date=YYYY-MM-DD      (optional, defaults to today in IST)
 *     Authorization: Bearer <ATTENDANCE_INTEGRATION_API_KEY>
 */
const attendanceIntegration = new Hono();

const safeCompare = (a: string, b: string) => {
    const aBuf = Buffer.from(a, "utf8");
    const bBuf = Buffer.from(b, "utf8");
    return aBuf.length === bBuf.length && timingSafeEqual(aBuf, bBuf);
};

// Fails closed: with no key configured the endpoint is disabled, not open.
attendanceIntegration.use("*", async (c, next) => {
    const expected = process.env.ATTENDANCE_INTEGRATION_API_KEY?.trim();
    if (!expected) {
        return c.json({ success: false, error: "Attendance integration API is not configured" }, 503);
    }

    const authHeader = c.req.header("authorization") ?? "";
    const provided = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!provided || !safeCompare(provided, expected)) {
        return c.json({ success: false, error: "Unauthorized" }, 401);
    }

    await next();
});

attendanceIntegration.get("/summary", async (c) => {
    const workspaceId = c.req.query("workspaceId") || c.req.header("x-workspace-id");
    if (!workspaceId) return c.json({ success: false, error: "workspaceId is required" }, 400);

    const dateStr = c.req.query("date");
    if (dateStr && !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return c.json({ success: false, error: "date must be YYYY-MM-DD" }, 400);
    }
    // Attendance rows are keyed by the IST calendar day (see checkIn).
    const date = dateStr ? toDateOnly(dateStr) : getISTDateOnly(new Date());
    if (!date) return c.json({ success: false, error: "date is not a valid calendar date" }, 400);

    try {
        // One row per member: their record for the day, an ON_LEAVE stand-in
        // for approved leave, or null — no check-in yet, which counts as absent.
        const register = await AttendanceService.getTeamRegister(workspaceId, date);

        // Late arrivals still came in, so `present` counts them too; `late`
        // is the subset of `present` that arrived late.
        const counts = { present: 0, late: 0, absent: 0, halfDay: 0, onLeave: 0 };
        for (const { attendance } of register) {
            switch (attendance?.status) {
                case AttendanceStatus.PRESENT: counts.present++; break;
                case AttendanceStatus.LATE: counts.present++; counts.late++; break;
                case AttendanceStatus.HALF_DAY: counts.halfDay++; break;
                case AttendanceStatus.ON_LEAVE: counts.onLeave++; break;
                default: counts.absent++;
            }
        }

        c.header("Cache-Control", "private, no-store");
        return c.json({
            success: true,
            data: { date: date.toISOString().slice(0, 10), total: register.length, ...counts },
        });
    } catch (error) {
        // This endpoint faces external systems: log the detail, return a
        // generic message so DB/stack internals never leave the server.
        console.error("[ATTENDANCE_INTEGRATION_ERROR]", error);
        return c.json({ success: false, error: "Failed to build attendance summary" }, 500);
    }
});

export default attendanceIntegration;
