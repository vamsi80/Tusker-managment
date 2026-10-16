import { describe, expect, it, vi } from "vitest";

// listTasks with view_mode "gantt" attaches per-parent subtask status counts,
// filtered exactly like a subtask expansion. Mock the DB and the permission
// lookup; keep the real query builder.
const db = vi.hoisted(() => ({ groupBy: vi.fn() }));
vi.mock("@tusker/db", async (importOriginal) => ({
    ...(await importOriginal<any>()),
    default: { task: { groupBy: db.groupBy } },
}));
vi.mock("../../../../permissions", () => ({
    fetchUserPermissions: vi.fn(),
    fetchWorkspacePermissions: vi.fn(async () => ({
        isWorkspaceAdmin: false,
        leadProjectIds: ["full"],
        managedProjectIds: [],
        coordinatorProjectIds: [],
        memberProjectIds: [],
        viewerProjectIds: ["restricted"],
        viewAllProjectIds: ["full"],
    })),
}));

const { TasksService } = await import("../tasks.service");

describe("Gantt parent rows carry filtered subtask status counts", () => {
    it("counts per parent with the active filters, restricted projects counted separately", async () => {
        vi.spyOn(TasksService as any, "_getTasksInternal").mockResolvedValue({
            tasks: [
                { id: "A", projectId: "full", parentTaskId: null, isParent: true },
                { id: "B", projectId: "restricted", parentTaskId: null, isParent: true },
                { id: "C", projectId: "full", parentTaskId: null, isParent: true },
            ],
            totalCount: 3,
        });
        db.groupBy.mockImplementation(async ({ where }: any) =>
            where.parentTaskId.in.includes("A")
                ? [
                    { parentTaskId: "A", status: "COMPLETED", _count: { _all: 2 } },
                    { parentTaskId: "A", status: "TO_DO", _count: { _all: 3 } },
                ]
                : [{ parentTaskId: "B", status: "REVIEW", _count: { _all: 1 } }],
        );

        const result: any = await TasksService.listTasks(
            { workspaceId: "w1", view_mode: "gantt", hierarchyMode: "parents", status: ["TO_DO", "COMPLETED"], assigneeId: "u9" },
            "u1",
        );

        const byId = Object.fromEntries(result.tasks.map((t: any) => [t.id, t.subtaskStatusCounts]));
        expect(byId).toEqual({ A: { COMPLETED: 2, TO_DO: 3 }, B: { REVIEW: 1 }, C: {} });

        // Two scopes → two queries, each with the user's filters applied to the subtasks.
        expect(db.groupBy).toHaveBeenCalledTimes(2);
        const [full, restricted] = db.groupBy.mock.calls.map(([args]: any) => args.where);
        expect(full.parentTaskId).toEqual({ in: ["A", "C"] });
        expect(full.status).toEqual({ in: ["TO_DO", "COMPLETED"] });
        expect(JSON.stringify(full)).toContain("u9"); // assignee filter
        expect(restricted.parentTaskId).toEqual({ in: ["B"] });
        expect(JSON.stringify(restricted)).toContain("u1"); // restricted member: own subtasks only
    });

    it("does nothing outside the Gantt", async () => {
        db.groupBy.mockClear();
        vi.spyOn(TasksService as any, "_getTasksInternal").mockResolvedValue({ tasks: [{ id: "A", parentTaskId: null }], totalCount: 1 });
        await TasksService.listTasks({ workspaceId: "w1", view_mode: "list" }, "u1");
        expect(db.groupBy).not.toHaveBeenCalled();
    });
});
