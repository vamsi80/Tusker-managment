import { describe, expect, it } from "vitest";
import { planBulkSync, type ExistingTask } from "../bulk-sync";

const exportedAt = new Date("2026-10-28T10:00:00Z");
const before = new Date("2026-10-01T00:00:00Z");

const task = (t: Partial<ExistingTask> & { id: string; name: string }): ExistingTask => ({
  parentTaskId: null, description: null, status: null, startDate: null, days: null,
  createdAt: before, updatedAt: before, assigneeEmail: null, reviewerEmail: null, tagNames: [],
  ...t,
});

// Design (p1): Wireframe (s1, REVIEW), Components (s2). Procurement (p2): Quotes (s3).
const existing = [
  task({ id: "p1", name: "Design" }),
  task({ id: "s1", name: "Wireframe", parentTaskId: "p1", status: "REVIEW", assigneeEmail: "a@x.com",
    startDate: new Date("2026-10-20T00:00:00+05:30"), days: 3 }),
  task({ id: "s2", name: "Components", parentTaskId: "p1", status: "TO_DO" }),
  task({ id: "p2", name: "Procurement" }),
  task({ id: "s3", name: "Quotes", parentTaskId: "p2", status: "TO_DO" }),
];

const exported = [
  { id: "p1", taskName: "Design" },
  { id: "s1", taskName: "Design", subtaskName: "Wireframe", status: "REVIEW", assigneeEmail: "a@x.com", startDate: "20 Oct 2026", days: 3 },
  { id: "s2", taskName: "Design", subtaskName: "Components", status: "TO_DO" },
  { id: "p2", taskName: "Procurement" },
  { id: "s3", taskName: "Procurement", subtaskName: "Quotes", status: "TO_DO" },
];

const plan = (rows: any[], at: Date | undefined = exportedAt, ex = existing) =>
  planBulkSync({ rows, existing: ex, knownTags: new Set(["DESIGN"]), exportedAt: at });

describe("planBulkSync", () => {
  it("an untouched export changes nothing", () => {
    const p = plan(exported);
    expect(p).toMatchObject({ invalid: [], updates: [], attaches: [], newRows: [], deletes: [], unchanged: 5 });
  });

  it("classifies edits, additions and removals", () => {
    const rows = [
      { id: "p1", taskName: "Design v2" },
      { id: "s1", taskName: "Design", subtaskName: "Wireframe", status: "COMPLETED", assigneeEmail: "B@x.com", startDate: "20 Oct 2026", days: 3 },
      // s2 removed, p2 + s3 removed
      { taskName: "Design v2", subtaskName: "Icons" },
      { taskName: "Brand new", subtaskName: "First" },
    ];
    const p = plan(rows);
    expect(p.invalid).toEqual([]);
    expect(p.updates.map((u) => [u.id, u.patch])).toEqual([
      ["p1", { name: "Design v2" }],
      ["s1", { status: "COMPLETED", assigneeEmail: "b@x.com" }],
    ]);
    expect(p.attaches).toEqual([{ rowNum: 4, parentTaskId: "p1", row: rows[2] }]);
    expect(p.newRows).toEqual([rows[3]]);
    // p2 goes with its subtask by cascade, so s3 is not deleted separately.
    expect(p.deletes.map((d) => d.id)).toEqual(["p2", "s2"]);
  });

  it("moving the start date recomputes the due date from days", () => {
    const rows = exported.map((r) => (r.id === "s1" ? { ...r, startDate: "22 Oct 2026" } : r));
    const [u] = plan(rows).updates;
    expect(u.patch.startDate).toBe(new Date("2026-10-22T00:00:00+05:30").toISOString());
    expect(u.patch.dueDate).toBe(new Date("2026-10-25T00:00:00+05:30").toISOString());
  });

  it("never deletes without the export stamp, nor tasks created after the export", () => {
    const noStamp = planBulkSync({ rows: exported.slice(0, 1), existing, knownTags: new Set() });
    expect(noStamp.deletes).toEqual([]);
    const late = [...existing, task({ id: "p3", name: "Made later", createdAt: new Date("2026-10-28T12:00:00Z") })];
    expect(plan(exported, exportedAt, late).deletes).toEqual([]);
  });

  it("keeps a parent whose row is gone but whose subtasks remain", () => {
    const p = plan(exported.filter((r) => r.id !== "p2"));
    expect(p.deletes).toEqual([]);
    expect(p.notes[0]).toContain("Procurement");
  });

  it("skips a subtask edited in the app after the export", () => {
    const stale = existing.map((t) => (t.id === "s2" ? { ...t, updatedAt: new Date("2026-10-28T11:00:00Z") } : t));
    const rows = exported.map((r) => (r.id === "s2" ? { ...r, subtaskName: "Renamed" } : r));
    const p = plan(rows, exportedAt, stale);
    expect(p.updates).toEqual([]);
    expect(p.notes[0]).toContain("changed in the app");
  });

  it("rejects unknown and duplicated IDs", () => {
    const p = plan([...exported, { id: "nope", taskName: "X" }, { ...exported[2] }]);
    expect(p.invalid).toHaveLength(2);
    expect(p.deletes).toEqual([]);
  });
});
