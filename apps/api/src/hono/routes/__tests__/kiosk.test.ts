import { describe, test, expect, beforeEach, vi } from "vitest";

vi.mock("@tusker/core/server/services/attendance/index", () => ({
    AttendanceService: {
        checkIn: vi.fn(async () => ({ id: "att-1", status: "PRESENT" })),
        checkOut: vi.fn(async () => ({ id: "att-1", checkOut: new Date() })),
    },
}));

import prisma from "@tusker/db";
import { AttendanceService } from "@tusker/core/server/services/attendance/index";
import kiosk from "../kiosk";

const SECRET = "test-device-secret";
const scan = (headers: Record<string, string>, body: any = { employeeId: "EMP-042" }) =>
    kiosk.request("/check-in", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
    });

const authed = { authorization: `Bearer ${SECRET}`, "x-workspace-id": "ws-1" };

describe("kiosk attendance route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.ATTENDANCE_DEVICE_SECRET = SECRET;
        (prisma.workspaceMember.findFirst as any).mockResolvedValue({ userId: "user-1" });
    });

    test("rejects a wrong device secret", async () => {
        const res = await scan({ authorization: "Bearer nope", "x-workspace-id": "ws-1" });
        expect(res.status).toBe(401);
        expect(AttendanceService.checkIn).not.toHaveBeenCalled();
    });

    test("fails closed when no secret is configured", async () => {
        delete process.env.ATTENDANCE_DEVICE_SECRET;
        const res = await scan({ authorization: "Bearer ", "x-workspace-id": "ws-1" });
        expect(res.status).toBe(401);
    });

    test("requires a workspace header and an employeeId", async () => {
        expect((await scan({ authorization: `Bearer ${SECRET}` })).status).toBe(400);
        expect((await scan(authed, {})).status).toBe(400);
    });

    test("404s an employeeId that maps to nobody", async () => {
        (prisma.workspaceMember.findFirst as any).mockResolvedValue(null);
        expect((await scan(authed)).status).toBe(404);
    });

    test("resolves employeeId to userId and checks in", async () => {
        const res = await scan(authed, { employeeId: "EMP-042", latitude: 17.44, longitude: 78.35, deviceId: "gate-1" });

        expect(prisma.workspaceMember.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({ where: { workspaceId: "ws-1", employeeId: "EMP-042" } })
        );
        expect(AttendanceService.checkIn).toHaveBeenCalledWith({
            workspaceId: "ws-1",
            userId: "user-1",
            latitude: 17.44,
            longitude: 78.35,
            notes: "Face ID kiosk (gate-1)",
        });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ success: true, data: { id: "att-1", status: "PRESENT" } });
    });

    test("serves the roster, skipping unenrolled members and leaking nothing else", async () => {
        (prisma.workspaceMember.findMany as any).mockResolvedValue([
            { employeeId: "EMP-042", user: { name: "Priya", surname: "S" } },
            { employeeId: "EMP-043", user: { name: "Arun", surname: null } },
        ]);

        const res = await kiosk.request("/members", { headers: authed });

        expect(prisma.workspaceMember.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: { workspaceId: "ws-1", employeeId: { not: null } } })
        );
        expect(await res.json()).toEqual({
            success: true,
            data: [
                { employeeId: "EMP-042", name: "Priya S" },
                { employeeId: "EMP-043", name: "Arun" },
            ],
        });
    });

    test("roster needs the device secret too", async () => {
        const res = await kiosk.request("/members", { headers: { authorization: "Bearer nope", "x-workspace-id": "ws-1" } });
        expect(res.status).toBe(401);
        expect(prisma.workspaceMember.findMany).not.toHaveBeenCalled();
    });

    test("propagates the service status code (duplicate check-in)", async () => {
        (AttendanceService.checkIn as any).mockRejectedValue(
            Object.assign(new Error("You have already checked in today."), { statusCode: 409 })
        );
        const res = await scan(authed);
        expect(res.status).toBe(409);
        expect(await res.json()).toEqual({ success: false, error: "You have already checked in today." });
    });
});
