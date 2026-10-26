import { beforeEach, describe, expect, it, vi } from "vitest";

// Moving a due date or deleting a task refunds the daily late charges it makes
// wrong. An in-memory ledger stands in for PointsEntry, with just the filters
// refundOverdue uses.
const db = vi.hoisted(() => ({
    rows: [] as any[],
    tasks: { T: { name: "Tiles", parentTaskId: null }, S: { name: "Grout", parentTaskId: "T" }, X: { name: "Other", parentTaskId: null } } as Record<string, any>,
}));
vi.mock("@tusker/db", async (importOriginal) => {
    const matchesTask = (r: any, where: any) =>
        where.taskId !== undefined
            ? r.taskId === where.taskId
            : where.task.OR.some((o: any) => r.taskId === o.id || db.tasks[r.taskId]?.parentTaskId === o.parentTaskId);
    const tx = {
        task: {
            update: vi.fn(async ({ where, data }: any) => ({ id: where.id, ...db.tasks[where.id], dueDate: data.dueDate ?? null })),
            updateMany: vi.fn(),
            delete: vi.fn(async ({ where }: any) => ({ id: where.id })),
        },
        pointsEntry: {
            findMany: vi.fn(async ({ where }: any) =>
                db.rows
                    .filter((r) => r.kind === where.kind && r.reversedAt === null && matchesTask(r, where) &&
                        (!where.occurredAt || r.occurredAt <= where.occurredAt.lte))
                    .map((r) => ({ ...r, task: { name: db.tasks[r.taskId].name } }))),
            updateMany: vi.fn(async ({ where, data }: any) => {
                for (const r of db.rows) if (where.id.in.includes(r.id)) r.reversedAt = data.reversedAt;
            }),
            createMany: vi.fn(async ({ data }: any) => { db.rows.push(...data); }),
        },
    };
    return {
        ...(await importOriginal<any>()),
        default: { $transaction: (fn: any) => fn(tx) },
    };
});

const { TaskRepository } = await import("../task.repository");

// October 2026: Fri 16, Sat 17, Mon 19, Tue 20. Charges are stamped at IST midnight.
const ist = (day: string, time = "00:00") => new Date(`${day}T${time}:00+05:30`);
const charge = (day: string, taskId = "T") => ({
    id: `${taskId}${day}`, taskId, workspaceId: "ws", workspaceMemberId: "m", points: -1,
    kind: "TASK_OVERDUE", reversedAt: null, occurredAt: ist(day),
});
/** Net points per task, and which charges still stand. */
const net = (taskId = "T") => db.rows.filter((r) => r.taskId === taskId).reduce((s, r) => s + r.points, 0);
const standing = () => db.rows.filter((r) => r.kind === "TASK_OVERDUE" && !r.reversedAt).map((r) => r.id);

describe("moving a due date refunds late charges", () => {
    beforeEach(() => {
        // T due Thu 15, charged Fri 16, Sat 17, Mon 19, Tue 20.
        db.rows = ["2026-10-16", "2026-10-17", "2026-10-19", "2026-10-20"].map((d) => charge(d));
    });

    it("moved past every charge: all refunded", async () => {
        await TaskRepository.updateDates("T", null, ist("2026-10-25"), null);
        expect(net()).toBe(0);
    });

    it("moved to Sat 17: Fri and Sat refunded, Mon and Tue still late", async () => {
        await TaskRepository.updateDates("T", null, ist("2026-10-17"), null);
        expect([net(), standing()]).toEqual([-2, ["T2026-10-19", "T2026-10-20"]]);
        expect(db.rows.at(-1).reason).toBe('Due date of "Tiles" moved');
    });

    it("a 23:59 due time counts as that same day", async () => {
        await TaskRepository.updateDates("T", null, ist("2026-10-17", "23:59"), null);
        expect(standing()).toEqual(["T2026-10-19", "T2026-10-20"]);
    });

    it("the edit form path refunds too, and clearing the date refunds everything", async () => {
        await TaskRepository.updateTaskAndParentCount("T", { dueDate: null }, null, false, false);
        expect(net()).toBe(0);
    });

    it("an edit that doesn't touch the due date refunds nothing", async () => {
        await TaskRepository.updateTaskAndParentCount("T", { name: "Tiles v2" }, null, false, false);
        expect(net()).toBe(-4);
    });

    it("moved earlier: nothing to refund", async () => {
        await TaskRepository.updateDates("T", null, ist("2026-10-10"), null);
        expect(net()).toBe(-4);
    });
});

describe("deleting a task refunds late charges", () => {
    beforeEach(() => {
        db.rows = [charge("2026-10-19", "T"), charge("2026-10-19", "S"), charge("2026-10-20", "S"), charge("2026-10-19", "X")];
    });

    it("refunds the task and its subtasks, leaves other tasks alone", async () => {
        await TaskRepository.deleteTask({ taskId: "T", projectId: "p", position: 0 });
        expect([net("T"), net("S"), net("X")]).toEqual([0, 0, -1]);
        expect(db.rows.find((r) => r.reversesEntryId === "S2026-10-20").reason).toBe('Deleted "Grout"');
    });

    it("deleting a subtask refunds only that subtask", async () => {
        await TaskRepository.deleteTask({ taskId: "S", parentTaskId: "T", projectId: "p", position: 0 });
        expect([net("T"), net("S")]).toEqual([-1, 0]);
    });
});
