import { describe, it, expect } from "vitest";
import { buildProjectRootWhere, buildOrderBy } from "@/lib/tasks/query-builder";

// The list view pages with a position-seek cursor: the WHERE clause must skip
// everything already returned, in the same order the query is sorted by.
// If these drift apart, "load more" silently re-returns page 1 and the list
// appears capped at its first page.
describe("project list pagination contract", () => {
    it("orders project roots by position then id", () => {
        expect(buildOrderBy(undefined, "list", "proj_1")).toEqual([
            { position: "asc" },
            { id: "asc" },
        ]);
    });

    it("seeks past the cursor row on the same (position, id) keys", () => {
        const where: any = buildProjectRootWhere("proj_1", {
            cursor: { id: "task_25", position: 24 } as any,
        });

        expect(where.AND).toEqual([
            {
                OR: [
                    { position: { gt: 24 } },
                    { AND: [{ position: 24 }, { id: { gt: "task_25" } }] },
                ],
            },
        ]);
    });

    it("does not constrain position when there is no cursor", () => {
        const where: any = buildProjectRootWhere("proj_1", {});
        expect(where.AND).toBeUndefined();
        expect(where.projectId).toBe("proj_1");
    });
});
