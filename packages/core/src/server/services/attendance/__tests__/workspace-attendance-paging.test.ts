import { describe, test, expect, vi } from "vitest";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const member = (id: string) => ({ id, user: { surname: id, email: `${id}@x.test` } });

// 10 check-ins on Sep 16, 2 on Sep 15, already in repository order.
const stored = [
    ...Array.from({ length: 10 }, (_, i) => ({ id: `a16-${i}`, workspaceMemberId: `m${i}`, date: day("2026-09-16"), status: "PRESENT" })),
    ...Array.from({ length: 2 }, (_, i) => ({ id: `a15-${i}`, workspaceMemberId: `m${i}`, date: day("2026-09-15"), status: "PRESENT" })),
];

vi.mock("@tusker/db", async (importOriginal) => {
    const actual = await importOriginal<any>();
    return {
        ...actual,
        default: {
            workspaceMember: { findFirst: vi.fn().mockResolvedValue({ id: "owner", workspaceRole: "OWNER", subordinates: [] }) },
            attendance: {
                findMany: vi.fn(async ({ skip = 0, take }: any) => stored.slice(skip, take === undefined ? undefined : skip + take)),
                count: vi.fn(async () => stored.length),
            },
            leave_request: {
                findMany: vi.fn(async () => [
                    { id: "l1", workspaceMemberId: "onLeave", startDate: day("2026-09-10"), endDate: day("2026-09-10"), WorkspaceMember: member("onLeave") },
                ]),
            },
        },
    };
});

const { AttendanceService } = await import("../attendance.service");

const page = (n: number) =>
    AttendanceService.getWorkspaceAttendance("w1", "owner", day("2026-09-01"), new Date("2026-09-30T23:59:59.999Z"), {}, n, 10);

describe("getWorkspaceAttendance paging with leave days", () => {
    test("leave days take their date's place instead of trailing page 1", async () => {
        const first = await page(1);
        expect(first.data.map((r: any) => r.id)).toEqual(stored.slice(0, 10).map((r) => r.id));
        expect(first.totalCount).toBe(13);

        const second = await page(2);
        expect(second.data.map((r: any) => r.status)).toEqual(["PRESENT", "PRESENT", "ON_LEAVE"]);
        expect(second.totalCount).toBe(13);
    });
});
