import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/pusher", () => ({ pusherServer: { trigger: vi.fn() } }));

const { WorkspaceService } = await import("../workspace.service");
const prisma = (await import("@/lib/db")).default;

const member = (surname: string, dob: string, userId = surname) => ({
  id: surname,
  userId,
  designation: null,
  dateOfBirth: new Date(dob),
  user: { surname },
});

/**
 * dateOfBirth is a UTC-midnight calendar day and the app runs on IST, so
 * "this month" has to be the IST day: a UTC read serves September's list to an
 * IST user for the first 5.5 hours of October.
 */
describe("WorkspaceService.getBirthdaysThisMonth", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T00:00:00Z"));
  });

  afterEach(() => vi.useRealTimers());

  it("keeps only this month's birthdays, sorted by day", async () => {
    (prisma.workspaceMember.findMany as any).mockResolvedValue([
      member("Ravi", "1990-09-22"),
      member("Priya", "1988-10-01"),
      member("Amit", "1995-09-01"),
    ]);

    const result = await WorkspaceService.getBirthdaysThisMonth("w1");

    expect(result.map((m) => [m.surname, m.day])).toEqual([
      ["Amit", 1],
      ["Ravi", 22],
    ]);
  });

  it("uses the IST calendar day, not the server's UTC day, at a month boundary", async () => {
    vi.setSystemTime(new Date("2026-09-30T19:00:00Z")); // 2026-10-01 00:30 IST

    (prisma.workspaceMember.findMany as any).mockResolvedValue([
      member("Ravi", "1990-09-22"),
      member("Priya", "1988-10-01"),
    ]);

    const result = await WorkspaceService.getBirthdaysThisMonth("w1");

    expect(result.map((m) => [m.surname, m.isToday])).toEqual([["Priya", true]]);
  });

  it("flags only the viewer's own birthday, which is what triggers the animation", async () => {
    (prisma.workspaceMember.findMany as any).mockResolvedValue([
      member("Ravi", "1990-09-22", "user-ravi"),
      member("Amit", "1995-09-01", "user-amit"),
    ]);

    const result = await WorkspaceService.getBirthdaysThisMonth("w1", "user-ravi");

    expect(result.map((m) => [m.surname, m.isSelf])).toEqual([
      ["Amit", false],
      ["Ravi", true],
    ]);
  });
});
