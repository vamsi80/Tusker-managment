import { describe, expect, it, vi } from "vitest";

// src/tests/setup.ts stubs @/lib/utils globally; date parsing here needs the real one.
vi.unmock("@/lib/utils");

import {
    aggregateStatusFromCounts,
    appendSubtask,
    applySubtaskPatch,
    parentProgress,
    removeSubtask,
    statusCountsOf,
    subtaskProgress,
} from "../utils";
import type { GanttSubtask, GanttTask } from "../types";

const sub = (id: string, status: string, extra: Partial<GanttSubtask> = {}): GanttSubtask => ({
    id, name: id, taskSlug: id, start: "1 Oct 2026", end: "10 Oct 2026", status,
    projectId: "p1", parentTaskId: "t1", createdById: null, position: 0, ...extra,
});
const task = (extra: Partial<GanttTask> = {}): GanttTask => ({
    id: "t1", name: "Parent", taskSlug: "t1", projectId: "p1", status: "TO_DO",
    createdById: null, parentTaskId: null, ...extra,
});

describe("parent progress = share of subtasks completed", () => {
    it("counts completed over all, leaving cancelled out", () => {
        expect(parentProgress({ COMPLETED: 3, TO_DO: 7 })).toBe(30);
        expect(parentProgress({ COMPLETED: 1, REVIEW: 1, CANCELLED: 2 })).toBe(50);
        expect(parentProgress({})).toBe(0);
        expect(parentProgress({ CANCELLED: 2 })).toBe(0);
    });

    it("uses the API's (filtered) counts until every subtask is loaded, then the live ones", () => {
        const collapsed = task({ subtaskStatusCounts: { COMPLETED: 1, TO_DO: 3 } });
        expect(parentProgress(statusCountsOf(collapsed))).toBe(25);

        const partlyLoaded = task({ subtaskStatusCounts: { COMPLETED: 1, TO_DO: 3 }, subtasks: [sub("a", "TO_DO")], hasMoreSubtasks: true });
        expect(parentProgress(statusCountsOf(partlyLoaded))).toBe(25);

        const fullyLoaded = task({ subtaskStatusCounts: { TO_DO: 2 }, subtasks: [sub("a", "COMPLETED"), sub("b", "TO_DO")] });
        expect(parentProgress(statusCountsOf(fullyLoaded))).toBe(50);
    });
});

describe("bar colour status from counts", () => {
    it("matches the subtask rules", () => {
        expect(aggregateStatusFromCounts({})).toBe("TO_DO");
        expect(aggregateStatusFromCounts({ COMPLETED: 2 })).toBe("COMPLETED");
        expect(aggregateStatusFromCounts({ TO_DO: 2, REVIEW: 1 })).toBe("IN_PROGRESS");
        expect(aggregateStatusFromCounts({ TO_DO: 2, COMPLETED: 1 })).toBe("IN_PROGRESS");
        expect(aggregateStatusFromCounts({ HOLD: 3 })).toBe("HOLD");
        expect(aggregateStatusFromCounts({ TO_DO: 3 })).toBe("TO_DO");
    });
});

describe("subtask progress is derived from its current status", () => {
    it("Completed 100, Review 80, To Do 0, In Progress ramps to 60 over its dates", () => {
        expect(subtaskProgress(sub("a", "COMPLETED"))).toBe(100);
        expect(subtaskProgress(sub("a", "REVIEW"))).toBe(80);
        expect(subtaskProgress(sub("a", "TO_DO"))).toBe(0);
        const today = new Date(2026, 9, 5, 15); // 5 Oct, half-way through 1–10 Oct (9 days)
        expect(subtaskProgress(sub("a", "IN_PROGRESS"), today)).toBe(27);
        expect(subtaskProgress(sub("a", "IN_PROGRESS"), new Date(2026, 9, 20))).toBe(60);
    });
});

describe("state helpers keep counts in step", () => {
    it("a status change moves one count", () => {
        const before = [task({ subtaskStatusCounts: { TO_DO: 2, COMPLETED: 0 }, subtasks: [sub("a", "TO_DO")], hasMoreSubtasks: true })];
        const [after] = applySubtaskPatch(before, "a", { status: "COMPLETED" });
        expect(after.subtaskStatusCounts).toEqual({ TO_DO: 1, COMPLETED: 1 });
        expect(after.subtasks![0].status).toBe("COMPLETED");
        // Non-status edits leave counts alone.
        const [renamed] = applySubtaskPatch(before, "a", { name: "x" });
        expect(renamed.subtaskStatusCounts).toBe(before[0].subtaskStatusCounts);
    });

    it("appending is idempotent, so the creator's realtime echo doesn't double-count", () => {
        const raw = { id: "new", parentTaskId: "t1", status: "TO_DO", name: "New", taskSlug: "new", projectId: "p1", startDate: "2026-10-01T00:00:00.000Z", dueDate: "2026-10-02T00:00:00.000Z" };
        const start = [task({ subtasks: [], subtaskCount: 0, subtaskStatusCounts: {} })];
        const once = appendSubtask(start, raw);
        const twice = appendSubtask(once, raw);
        expect(twice[0].subtasks).toHaveLength(1);
        expect(twice[0].subtaskCount).toBe(1);
        expect(twice[0].subtaskStatusCounts).toEqual({ TO_DO: 1 });
    });

    it("removing takes the subtask out of the counts", () => {
        const start = [task({ subtasks: [sub("a", "REVIEW")], subtaskCount: 1, subtaskStatusCounts: { REVIEW: 1 } })];
        const [after] = removeSubtask(start, { id: "a", parentTaskId: "t1" });
        expect(after.subtasks).toHaveLength(0);
        expect(after.subtaskCount).toBe(0);
        expect(after.subtaskStatusCounts).toEqual({ REVIEW: 0 });
    });
});
