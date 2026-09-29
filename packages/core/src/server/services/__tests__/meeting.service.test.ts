import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../lib/pusher", () => ({
  pusherServer: {
    trigger: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../../../lib/realtime", () => ({
  broadcastMeetingUpdate: vi.fn().mockResolvedValue(undefined),
  MEETING_UPDATE: "meeting_update",
}));

vi.mock("@tusker/db", () => {
  const db = {
    meeting: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    meetingAttendee: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
      upsert: vi.fn(),
    },
    notification: {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    task: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    workspaceMember: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    public_holiday: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    leave_request: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
  return { default: db };
});

const { MeetingService } = await import("../meeting.service");
const prisma = (await import("@tusker/db")).default;
const { broadcastMeetingUpdate } = await import("../../../lib/realtime");

describe("MeetingService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a meeting with organizer as accepted attendee and broadcasts event", async () => {
    const mockCreatedMeeting = {
      id: "m-1",
      workspaceId: "w-1",
      organizerId: "user-1",
      title: "Sprint Planning",
      startTime: new Date("2026-09-10T10:00:00Z"),
      endTime: new Date("2026-09-10T11:00:00Z"),
      type: "INTERNAL",
      status: "SCHEDULED",
      color: "indigo",
      attendees: [
        { id: "att-1", userId: "user-1", status: "ACCEPTED" },
        { id: "att-2", userId: "user-2", status: "INVITED" },
      ],
    };

    (prisma.meeting.create as any).mockResolvedValue(mockCreatedMeeting);

    const result = await MeetingService.createMeeting("w-1", "user-1", {
      title: "Sprint Planning",
      startTime: "2026-09-10T10:00:00Z",
      endTime: "2026-09-10T11:00:00Z",
      attendeeUserIds: ["user-2"],
    });

    expect(prisma.meeting.create).toHaveBeenCalledTimes(1);
    expect(broadcastMeetingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "w-1",
        type: "CREATE",
        meetingId: "m-1",
      })
    );
    expect(result.id).toBe("m-1");
  });

  it("queries meetings and aggregates ERP layers when includeLayers is true", async () => {
    const mockMeetings = [
      {
        id: "m-1",
        title: "Sprint Planning",
        startTime: new Date("2026-09-10T10:00:00Z"),
        endTime: new Date("2026-09-10T11:00:00Z"),
      },
    ];

    (prisma.meeting.findMany as any).mockResolvedValue(mockMeetings);
    (prisma.task.findMany as any).mockResolvedValue([
      {
        id: "t-1",
        name: "Design Review",
        taskSlug: "tsk-1",
        dueDate: new Date("2026-09-12"),
        status: "TODO",
        projectId: "p-1",
      },
    ]);
    (prisma.public_holiday.findMany as any).mockResolvedValue([
      { id: "h-1", name: "Festival Holiday", date: new Date("2026-09-15") },
    ]);
    (prisma.leave_request.findMany as any).mockResolvedValue([]);

    const result = await MeetingService.getMeetings("w-1", {
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      includeLayers: true,
    });

    expect(result.meetings).toHaveLength(1);
    expect(result.taskDeadlines).toHaveLength(1);
    expect(result.publicHolidays).toHaveLength(1);
    expect(result.taskDeadlines[0].title).toBe("Task Due: Design Review");
  });

  it("lists only the viewer's meetings and flags overlaps", async () => {
    const at = (h: number) => new Date(`2026-09-10T${String(h).padStart(2, "0")}:00:00Z`);
    (prisma.meeting.findMany as any).mockResolvedValue([
      { id: "a", title: "A", startTime: at(10), endTime: at(11), status: "SCHEDULED", isAllDay: false, attendees: [] },
      { id: "b", title: "B", startTime: at(10), endTime: at(12), status: "SCHEDULED", isAllDay: false, attendees: [] },
      { id: "c", title: "C", startTime: at(11), endTime: at(12), status: "CANCELLED", isAllDay: false, attendees: [] },
      { id: "d", title: "D", startTime: at(11), endTime: at(13), status: "SCHEDULED", isAllDay: false,
        attendees: [{ userId: "user-1", status: "DECLINED" }] },
      { id: "e", title: "E", startTime: at(12), endTime: at(13), status: "SCHEDULED", isAllDay: false, attendees: [] },
    ]);

    const { meetings } = await MeetingService.getMeetings("w-1", {}, "user-1");

    expect((prisma.meeting.findMany as any).mock.calls[0][0].where.OR).toEqual([
      { organizerId: "user-1" },
      { attendees: { some: { userId: "user-1" } } },
    ]);
    const byId = Object.fromEntries(meetings.map((m: any) => [m.id, m.overlapsWith.map((o: any) => o.id)]));
    expect(byId).toEqual({ a: ["b"], b: ["a"], c: [], d: [], e: [] });
  });

  it("calendar shows no tasks without a viewer", async () => {
    (prisma.meeting.findMany as any).mockResolvedValue([]);
    await MeetingService.getMeetings("w-1", { includeLayers: true });
    expect((prisma.task.findMany as any).mock.calls[0][0].where.id).toBe("__none__");
  });

  it("updates RSVP status and broadcasts RSVP_UPDATE event", async () => {
    (prisma.meetingAttendee.upsert as any).mockResolvedValue({
      id: "att-1",
      meetingId: "m-1",
      userId: "user-2",
      status: "ACCEPTED",
      meeting: { workspaceId: "w-1" },
    });

    const result = await MeetingService.rsvpMeeting("m-1", "user-2", "ACCEPTED");

    expect(prisma.meetingAttendee.upsert).toHaveBeenCalledTimes(1);
    expect(broadcastMeetingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "w-1",
        type: "RSVP_UPDATE",
        meetingId: "m-1",
      })
    );
    expect(result.status).toBe("ACCEPTED");
  });

  it("deletes a meeting and broadcasts DELETE event", async () => {
    (prisma.meeting.findUnique as any).mockResolvedValue({
      id: "m-1",
      workspaceId: "w-1",
      title: "Sprint Planning",
      attendees: [],
    });
    (prisma.meeting.delete as any).mockResolvedValue({ id: "m-1" });

    const result = await MeetingService.deleteMeeting("m-1", "w-1", "user-1");

    expect(prisma.meeting.delete).toHaveBeenCalledWith({ where: { id: "m-1" } });
    expect(broadcastMeetingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "w-1",
        type: "DELETE",
        meetingId: "m-1",
      })
    );
    expect(result.success).toBe(true);
  });

  describe("Role-based task visibility in calendar", () => {
    it("filters tasks so a normal member only views tasks assigned to them", async () => {
      (prisma.meeting.findMany as any).mockResolvedValue([]);
      (prisma.public_holiday.findMany as any).mockResolvedValue([]);
      (prisma.leave_request.findMany as any).mockResolvedValue([]);

      (prisma.workspaceMember.findFirst as any).mockResolvedValue({
        id: "mem-1",
        workspaceRole: "MEMBER",
        workspace: { ownerId: "owner-1" },
        managedProjects: [],
        projectMembers: [],
        subordinates: [],
      });

      await MeetingService.getMeetings(
        "w-1",
        { startDate: "2026-09-01", endDate: "2026-09-30", includeLayers: true },
        "user-member"
      );

      expect(prisma.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            workspaceId: "w-1",
            AND: expect.arrayContaining([
              expect.objectContaining({
                OR: expect.arrayContaining([
                  { assignee: { workspaceMember: { userId: "user-member" } } },
                  { assigneeId: "user-member" },
                  { assignee: { workspaceMemberId: "mem-1" } },
                ]),
              }),
            ]),
          }),
        })
      );
    });

    it("lets a project manager see their projects' tasks but not their direct reports' other tasks", async () => {
      (prisma.meeting.findMany as any).mockResolvedValue([]);
      (prisma.public_holiday.findMany as any).mockResolvedValue([]);
      (prisma.leave_request.findMany as any).mockResolvedValue([]);

      (prisma.workspaceMember.findFirst as any).mockResolvedValue({
        id: "pm-1",
        workspaceRole: "MEMBER",
        workspace: { ownerId: "owner-1" },
        managedProjects: [{ id: "proj-managed-1" }],
        projectMembers: [{ projectId: "proj-lead-1" }],
        subordinates: [{ id: "sub-member-1", userId: "sub-user-1" }],
      });

      await MeetingService.getMeetings(
        "w-1",
        { startDate: "2026-09-01", endDate: "2026-09-30", includeLayers: true },
        "user-pm"
      );

      const where = (prisma.task.findMany as any).mock.calls[0][0].where;
      expect(where.workspaceId).toBe("w-1");
      expect(where.AND[0].OR).toEqual([
        { assignee: { workspaceMember: { userId: "user-pm" } } },
        { assigneeId: "user-pm" },
        { assignee: { workspaceMemberId: "pm-1" } },
        { projectId: { in: ["proj-managed-1", "proj-lead-1"] } },
      ]);
    });

    it("allows an owner to view everybody's tasks without restrictions", async () => {
      (prisma.meeting.findMany as any).mockResolvedValue([]);
      (prisma.public_holiday.findMany as any).mockResolvedValue([]);
      (prisma.leave_request.findMany as any).mockResolvedValue([]);

      (prisma.workspaceMember.findFirst as any).mockResolvedValue({
        id: "owner-member-1",
        workspaceRole: "OWNER",
        workspace: { ownerId: "user-owner" },
        managedProjects: [],
        projectMembers: [],
        subordinates: [],
      });

      await MeetingService.getMeetings(
        "w-1",
        { startDate: "2026-09-01", endDate: "2026-09-30", includeLayers: true },
        "user-owner"
      );

      expect(prisma.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            workspaceId: "w-1",
            status: { notIn: ["COMPLETED", "CANCELLED"] },
            dueDate: expect.any(Object),
          },
        })
      );
      // Verify no AND condition was added restricting assignees
      const lastCall = (prisma.task.findMany as any).mock.calls.at(-1)[0];
      expect(lastCall.where.AND).toBeUndefined();
    });

    it("excludes completed and cancelled tasks from calendar deadlines", async () => {
      (prisma.meeting.findMany as any).mockResolvedValue([]);
      (prisma.public_holiday.findMany as any).mockResolvedValue([]);
      (prisma.leave_request.findMany as any).mockResolvedValue([]);

      (prisma.workspaceMember.findFirst as any).mockResolvedValue({
        id: "owner-member-1",
        workspaceRole: "OWNER",
        workspace: { ownerId: "user-owner" },
        managedProjects: [],
        projectMembers: [],
        subordinates: [],
      });

      await MeetingService.getMeetings(
        "w-1",
        { startDate: "2026-09-01", endDate: "2026-09-30", includeLayers: true },
        "user-owner"
      );

      expect(prisma.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { notIn: ["COMPLETED", "CANCELLED"] },
          }),
        })
      );
    });
  });
});
