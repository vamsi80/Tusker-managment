import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@tusker/db";
import { PointsService } from "./points.service";

vi.mock("@tusker/db", async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    default: {
        pointsEntry: { findFirst: vi.fn(), createMany: vi.fn() },
        task: { findMany: vi.fn() },
        public_holiday: { findMany: vi.fn() },
    },
}));
vi.mock("../../../lib/notifications", () => ({ sendNotification: vi.fn() }));
vi.mock("../../../permissions", () => ({ fetchWorkspacePermissions: vi.fn() }));

const db = prisma as any;
// October 2026: Sat 17, Sun 18, Mon 19, Tue 20, Wed 21.
const ist = (day: string, time = "00:00") => new Date(`${day}T${time}:00+05:30`);
const task = (id: string, dueDay: string) => ({
    id, name: id, workspaceId: "ws", dueDate: ist(dueDay), assignee: { workspaceMemberId: `m-${id}` },
});
/** Runs the job and returns the "taskId@IST day" charges it wrote. */
async function run(
    now: Date,
    lastCharge: string | null,
    holidays: string[] = [],
    tasks = [task("A", "2026-10-15"), task("B", "2026-10-19")]
) {
    db.pointsEntry.findFirst.mockResolvedValue(lastCharge ? { occurredAt: ist(lastCharge) } : null);
    db.task.findMany.mockResolvedValue(tasks);
    db.public_holiday.findMany.mockResolvedValue(
        holidays.map((d) => ({ workspaceId: "ws", date: new Date(`${d}T00:00:00Z`) }))
    );
    db.pointsEntry.createMany.mockImplementation(async ({ data }: any) => ({ count: data.length }));
    await PointsService.accrueOverdue(now);
    const data = db.pointsEntry.createMany.mock.calls.at(-1)?.[0].data ?? [];
    return data.map((e: any) => `${e.taskId}@${new Date(e.occurredAt.getTime() + 5.5 * 3600e3).toISOString().slice(0, 10)}`);
}

describe("accrueOverdue", () => {
    beforeEach(() => vi.clearAllMocks());

    it("charges only today on the very first run", async () => {
        expect(await run(ist("2026-10-20", "00:30"), null)).toEqual(["A@2026-10-20", "B@2026-10-20"]);
    });

    it("fills the days the cron missed, skipping Sunday", async () => {
        // Last ran Sat 17; Sun 18 is off; Mon 19 and Tue 20 are both owed.
        expect(await run(ist("2026-10-20", "00:30"), "2026-10-17")).toEqual([
            "A@2026-10-19", "A@2026-10-20", "B@2026-10-20",
        ]);
    });

    it("skips a workspace holiday inside the gap", async () => {
        expect(await run(ist("2026-10-20", "00:30"), "2026-10-17", ["2026-10-19"])).toEqual([
            "A@2026-10-20", "B@2026-10-20",
        ]);
    });

    it("a second run the same day writes nothing", async () => {
        await run(ist("2026-10-20", "09:00"), "2026-10-20");
        expect(db.pointsEntry.createMany).not.toHaveBeenCalled();
    });

    it("never reaches back more than a week", async () => {
        const charged = await run(ist("2026-10-21", "00:30"), "2026-09-01", [], [task("C", "2026-09-01")]);
        expect(charged.map((c: string) => c.slice(2))).toEqual([
            "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-19", "2026-10-20", "2026-10-21",
        ]);
    });
});
