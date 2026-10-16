import { describe, expect, it, vi, beforeEach } from "vitest";
import { resolveProjectPermissions } from "../../../../lib/constants/project-permissions";

// Who-sees-what is decided by resolveTaskPermissions from the caller's permissions;
// mock only the DB lookups behind them and keep the real permission matrix.
const perms = vi.hoisted(() => ({ project: {} as any, workspace: {} as any }));
vi.mock("../../../../permissions", () => ({
    fetchUserPermissions: vi.fn(async () => perms.project),
    fetchWorkspacePermissions: vi.fn(async () => perms.workspace),
}));
vi.mock("@tusker/db", async (importOriginal) => ({ ...(await importOriginal<any>()), default: {} }));

const { TasksService } = await import("../tasks.service");

const asProjectRole = (projectRole: any, overrides?: Record<string, boolean>) => {
    // Same shape fetchUserPermissions returns.
    perms.project = {
        isWorkspaceAdmin: false,
        isProjectManager: projectRole === "PROJECT_MANAGER",
        isProjectCoordinator: projectRole === "PROJECT_COORDINATOR",
        isProjectLead: projectRole === "LEAD",
        isMember: projectRole === "MEMBER",
        projectPermissions: resolveProjectPermissions(projectRole, overrides),
    };
};
/** Full project view in a list-type view (members see all) and on the kanban (they don't). */
const fullAccess = async () => ({
    list: (await TasksService.resolveTaskPermissions("w1", "p1", "u1")).fullAccessProjectIds.includes("p1"),
    kanban: (await TasksService.resolveTaskPermissions("w1", "p1", "u1", false)).fullAccessProjectIds.includes("p1"),
});

describe("task visibility follows the project's See all tasks permission", () => {
    beforeEach(() => {
        perms.project = {};
        perms.workspace = {};
    });

    it("defaults match how it shipped: coordinators see all, members only their own on the board", async () => {
        asProjectRole("PROJECT_COORDINATOR");
        expect(await fullAccess()).toEqual({ list: true, kanban: true });
        asProjectRole("MEMBER");
        expect(await fullAccess()).toEqual({ list: true, kanban: false });
        asProjectRole("VIEWER");
        expect(await fullAccess()).toEqual({ list: false, kanban: false });
    });

    it("ticking it gives a member the whole board", async () => {
        asProjectRole("MEMBER", { "task:view_all": true });
        expect(await fullAccess()).toEqual({ list: true, kanban: true });
    });

    it("unticking it limits a coordinator to their own tasks everywhere", async () => {
        asProjectRole("PROJECT_COORDINATOR", { "task:view_all": false });
        expect(await fullAccess()).toEqual({ list: false, kanban: false });
    });

    it("workspace-wide views use the per-project setting", async () => {
        perms.workspace = {
            isWorkspaceAdmin: false,
            leadProjectIds: ["lead"],
            managedProjectIds: [],
            coordinatorProjectIds: ["coord"],
            memberProjectIds: ["member-plain", "member-ticked"],
            viewerProjectIds: [],
            // "coord" had it unticked; "member-ticked" had it ticked.
            viewAllProjectIds: ["lead", "member-ticked"],
        };
        const board = await TasksService.resolveTaskPermissions("w1", undefined, "u1", false);
        expect(board.fullAccessProjectIds.sort()).toEqual(["lead", "member-ticked"]);
        expect(board.restrictedProjectIds.sort()).toEqual(["coord", "member-plain"]);

        const list = await TasksService.resolveTaskPermissions("w1", undefined, "u1");
        expect(list.fullAccessProjectIds.sort()).toEqual(["lead", "member-plain", "member-ticked"]);
    });
});
