import { describe, test, expect, beforeEach, vi } from "vitest";
import { Hono } from "hono";
import prisma from "@tusker/db";
import meetings from "../meetings";

const app = new Hono()
    .use("*", async (c, next) => {
        c.set("user" as never, { id: "user-1" } as never);
        await next();
    })
    .onError((err: any, c) => c.json({ error: err.message }, err.statusCode ?? 500))
    .route("/meetings", meetings);

const check = (body: any) =>
    app.request("/meetings/conflicts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });

const slot = {
    workspaceId: "ws-1",
    startTime: "2026-09-20T10:00:00.000Z",
    endTime: "2026-09-20T11:00:00.000Z",
};

describe("meeting conflicts route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (prisma.workspaceMember.findFirst as any).mockResolvedValue({ id: "wm-1" });
    });

    test("refuses non-members", async () => {
        (prisma.workspaceMember.findFirst as any).mockResolvedValue(null);
        expect((await check(slot)).status).toBe(403);
        expect(prisma.meeting.findMany).not.toHaveBeenCalled();
    });

    test("queries overlapping, non-cancelled meetings by venue or person", async () => {
        await check({ ...slot, location: " Room B ", attendeeUserIds: ["user-2"], excludeMeetingId: "m-self" });
        const where = (prisma.meeting.findMany as any).mock.calls[0][0].where;
        expect(where).toMatchObject({
            workspaceId: "ws-1",
            status: { not: "CANCELLED" },
            startTime: { lt: new Date(slot.endTime) },
            endTime: { gt: new Date(slot.startTime) },
            id: { not: "m-self" },
        });
        expect(where.OR[0]).toEqual({ location: { equals: "Room B", mode: "insensitive" } });
        expect(where.OR[1].attendees.some.userId.in).toEqual(["user-1", "user-2"]);
    });

    test("labels why each meeting clashes", async () => {
        (prisma.meeting.findMany as any).mockResolvedValue([
            { id: "a", title: "Venue only", location: "room b", attendees: [] },
            { id: "b", title: "Person only", location: "Room C", attendees: [{ user: { id: "user-2", name: "Priya", surname: null } }] },
        ]);
        const { data } = await (await check({ ...slot, location: "Room B" })).json();
        expect(data.map((d: any) => [d.id, d.venueClash, d.clashingMembers.length])).toEqual([
            ["a", true, 0],
            ["b", false, 1],
        ]);
    });

    test("skips the query for an empty or inverted slot", async () => {
        const { data } = await (await check({ ...slot, endTime: slot.startTime })).json();
        expect(data).toEqual([]);
        expect(prisma.meeting.findMany).not.toHaveBeenCalled();
    });
});
