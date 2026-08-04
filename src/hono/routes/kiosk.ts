import { Hono } from "hono";
import prisma from "@/lib/db";
import { AttendanceService } from "@/server/services/attendance";

/**
 * Kiosk Attendance API
 *
 * Machine-to-machine entry point for a shared face-recognition device at the
 * office entrance. Authenticated by a shared device secret (same pattern as
 * routes/cron.ts) instead of a user session, so it must be mounted BEFORE
 * authMiddleware in hono/index.ts.
 *
 * Face embeddings never leave the device: it recognises a face locally and
 * sends us the matching WorkspaceMember.employeeId.
 */
const kiosk = new Hono();

// Fails closed when the secret is unset (unlike verifyCronSecret, which fails open).
const verifyDeviceSecret = (c: any) => {
    const secret = process.env.ATTENDANCE_DEVICE_SECRET;
    return !!secret && c.req.header("authorization") === `Bearer ${secret}`;
};

const scanHandler = (mode: "CHECK_IN" | "CHECK_OUT") => async (c: any) => {
    if (!verifyDeviceSecret(c)) {
        return c.json({ success: false, error: "Unauthorized device" }, 401);
    }

    const workspaceId = c.req.header("x-workspace-id");
    if (!workspaceId) return c.json({ success: false, error: "Workspace ID is required" }, 400);

    const { employeeId, latitude, longitude, deviceId } = await c.req.json().catch(() => ({}));
    if (!employeeId) return c.json({ success: false, error: "employeeId is required" }, 400);

    const member = await prisma.workspaceMember.findFirst({
        where: { workspaceId, employeeId: String(employeeId) },
        select: { userId: true },
    });
    if (!member) {
        return c.json({ success: false, error: `No member with employeeId '${employeeId}' in this workspace` }, 404);
    }

    // The `notes` string is what makes AttendanceService skip its geofence checks.
    // Intentional: a bolted-down kiosk IS the location proof, GPS adds nothing here.
    // ponytail: audit trail lives in checkInNotes; add a `source` column when someone
    // needs to filter/report by WEB vs KIOSK.
    const params = {
        workspaceId,
        userId: member.userId,
        latitude,
        longitude,
        notes: `Face ID kiosk${deviceId ? ` (${deviceId})` : ""}`,
    };

    try {
        const data = mode === "CHECK_IN"
            ? await AttendanceService.checkIn(params)
            : await AttendanceService.checkOut(params);
        return c.json({ success: true, data });
    } catch (error: any) {
        return c.json({ success: false, error: error.message }, (parseInt(error.statusCode) || 400) as any);
    }
};

kiosk.post("/check-in", scanHandler("CHECK_IN"));
kiosk.post("/check-out", scanHandler("CHECK_OUT"));

export default kiosk;
