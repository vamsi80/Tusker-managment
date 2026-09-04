import prisma from "@/lib/db";
import { broadcastMeetingUpdate } from "@/lib/realtime";
import { pusherServer } from "@/lib/pusher";
import { randomUUID } from "crypto";
import type { MeetingType, MeetingStatus, AttendeeStatus } from "@/generated/prisma";

export interface CreateMeetingInput {
  title: string;
  description?: string | null;
  startTime: Date | string;
  endTime: Date | string;
  location?: string | null;
  meetingUrl?: string | null;
  type?: MeetingType;
  status?: MeetingStatus;
  color?: string;
  reminderMinutes?: number;
  isAllDay?: boolean;
  projectId?: string | null;
  attendeeUserIds?: string[];
}

export interface UpdateMeetingInput extends Partial<CreateMeetingInput> {
  status?: MeetingStatus;
}

export interface GetMeetingsFilter {
  startDate?: Date | string;
  endDate?: Date | string;
  projectId?: string;
  type?: MeetingType;
  includeLayers?: boolean;
}

export class MeetingService {
  /**
   * Notify users who were just invited to a meeting: a stored notification each,
   * plus a real-time nudge on their personal channel so the bell reacts at once.
   */
  private static async notifyInvitees(
    workspaceId: string,
    organizerId: string,
    meeting: { id: string; title: string; startTime: Date; location: string | null; meetingUrl: string | null },
    inviteeUserIds: string[]
  ) {
    if (inviteeUserIds.length === 0) return;

    const formattedDate = new Date(meeting.startTime).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    const message = `You are invited to "${meeting.title}" on ${formattedDate}`;

    await prisma.notification
      .createMany({
        data: inviteeUserIds.map((uid) => ({
          id: randomUUID(),
          userId: uid,
          workspaceId,
          title: "Meeting Scheduled",
          body: message,
          type: "MEETING_SCHEDULED",
          entityId: meeting.id,
          entityType: "MEETING",
          metadata: {
            meetingId: meeting.id,
            startTime: meeting.startTime,
            location: meeting.location,
            meetingUrl: meeting.meetingUrl,
          },
          updatedAt: new Date(),
        })),
      })
      .catch((err) => console.error("[MEETING_SERVICE] Failed to save notifications:", err));

    if (pusherServer) {
      await pusherServer
        .trigger(
          inviteeUserIds.map((id) => `user-${id}`),
          "activity_log",
          {
            action: "MEETING_SCHEDULED",
            entityId: meeting.id,
            entityType: "MEETING",
            notification: true,
            message,
            newData: meeting,
            userId: organizerId,
          }
        )
        .catch((err) => console.error("[MEETING_SERVICE] Pusher activity_log error:", err));
    }
  }

  /**
   * Retrieve workspace meetings and optional ERP calendar layers (tasks, holidays, leaves).
   */
  static async getMeetings(workspaceId: string, filter: GetMeetingsFilter = {}, userId?: string) {
    const start = filter.startDate ? new Date(filter.startDate) : undefined;
    const end = filter.endDate ? new Date(filter.endDate) : undefined;

    const where: any = { workspaceId };
    if (start && end) {
      where.AND = [
        { startTime: { lte: end } },
        { endTime: { gte: start } },
      ];
    } else if (start) {
      where.endTime = { gte: start };
    } else if (end) {
      where.startTime = { lte: end };
    }

    if (filter.projectId) where.projectId = filter.projectId;
    if (filter.type) where.type = filter.type;

    const meetingSelect = {
      id: true,
      workspaceId: true,
      title: true,
      description: true,
      startTime: true,
      endTime: true,
      location: true,
      meetingUrl: true,
      type: true,
      status: true,
      color: true,
      reminderMinutes: true,
      isAllDay: true,
      organizerId: true,
      projectId: true,
      createdAt: true,
      updatedAt: true,
      organizer: {
        select: {
          id: true,
          name: true,
          surname: true,
          email: true,
          image: true,
        },
      },
      project: {
        select: {
          id: true,
          name: true,
          slug: true,
          color: true,
        },
      },
      attendees: {
        select: {
          id: true,
          userId: true,
          status: true,
          user: {
            select: {
              id: true,
              name: true,
              surname: true,
              email: true,
              image: true,
            },
          },
        },
      },
    };

    const meetings = await prisma.meeting.findMany({
      where,
      select: meetingSelect,
      orderBy: { startTime: "asc" },
    });

    if (!filter.includeLayers) {
      return { meetings, taskDeadlines: [], publicHolidays: [], leaves: [] };
    }

    // ponytail: Role-based task visibility filter for calendar
    // - Normal members see only their assigned tasks
    // - Project managers see their team members' tasks (managed projects & direct reports) + their own tasks
    // - Owners/Admins see all tasks across the workspace
    let taskWhere: any = {
      workspaceId,
      dueDate: { not: null, ...(start && end ? { gte: start, lte: end } : {}) },
    };

    if (filter.projectId) {
      taskWhere.projectId = filter.projectId;
    }

    if (userId) {
      const workspaceMember = await prisma.workspaceMember.findFirst({
        where: { workspaceId, userId },
        select: {
          id: true,
          workspaceRole: true,
          workspace: {
            select: { ownerId: true },
          },
          managedProjects: {
            select: { id: true },
          },
          projectMembers: {
            where: {
              projectRole: { in: ["PROJECT_MANAGER", "LEAD"] },
            },
            select: { projectId: true },
          },
          subordinates: {
            select: { id: true, userId: true },
          },
        },
      });

      if (!workspaceMember) {
        // User is not a member of this workspace -> no tasks visible
        taskWhere.id = "__none__";
      } else {
        const isOwnerOrAdmin =
          workspaceMember.workspaceRole === "OWNER" ||
          workspaceMember.workspaceRole === "ADMIN" ||
          workspaceMember.workspace?.ownerId === userId;

        if (!isOwnerOrAdmin) {
          const managedProjectIds = Array.from(
            new Set([
              ...workspaceMember.managedProjects.map((p) => p.id),
              ...workspaceMember.projectMembers.map((pm) => pm.projectId),
            ])
          );
          const subordinateMemberIds = workspaceMember.subordinates.map((s) => s.id);
          const subordinateUserIds = workspaceMember.subordinates.map((s) => s.userId);

          // Criteria:
          // 1. Members can view their own tasks (assigned to their project member / user ID)
          // 2. Project managers can see their team members' tasks:
          //    - all tasks in projects they manage (their project team's tasks)
          //    - all tasks assigned to direct subordinate team members (reportTo)
          const visibilityConditions: any[] = [
            { assignee: { workspaceMember: { userId } } },
            { assigneeId: userId },
            { assignee: { workspaceMemberId: workspaceMember.id } },
          ];

          if (managedProjectIds.length > 0) {
            visibilityConditions.push({
              projectId: { in: managedProjectIds },
            });
          }

          if (subordinateMemberIds.length > 0 || subordinateUserIds.length > 0) {
            visibilityConditions.push({
              OR: [
                { assignee: { workspaceMemberId: { in: subordinateMemberIds } } },
                { assignee: { workspaceMember: { userId: { in: subordinateUserIds } } } },
              ],
            });
          }

          taskWhere.AND = [
            ...(taskWhere.AND ? (Array.isArray(taskWhere.AND) ? taskWhere.AND : [taskWhere.AND]) : []),
            { OR: visibilityConditions },
          ];
        }
      }
    }

    // ponytail: parallel stdlib queries for multi-layered ERP calendar view
    const [tasks, holidays, leaves] = await Promise.all([
      prisma.task.findMany({
        where: taskWhere,
        select: {
          id: true,
          name: true,
          taskSlug: true,
          dueDate: true,
          status: true,
          projectId: true,
        },
        take: 100,
      }),
      prisma.public_holiday.findMany({
        where: {
          workspaceId,
          ...(start && end ? { date: { gte: start, lte: end } } : {}),
        },
        select: {
          id: true,
          name: true,
          date: true,
        },
      }),
      prisma.leave_request.findMany({
        where: {
          workspaceId,
          status: "APPROVED",
          ...(start && end
            ? {
                AND: [
                  { startDate: { lte: end } },
                  { endDate: { gte: start } },
                ],
              }
            : {}),
        },
        select: {
          id: true,
          startDate: true,
          endDate: true,
          type: true,
          WorkspaceMember: {
            select: {
              id: true,
              user: {
                select: {
                  id: true,
                  name: true,
                  surname: true,
                },
              },
            },
          },
        },
        take: 50,
      }),
    ]);

    return {
      meetings,
      taskDeadlines: tasks.map((t) => ({
        id: t.id,
        title: `Task Due: ${t.name}`,
        date: t.dueDate,
        status: t.status,
        taskSlug: t.taskSlug,
        projectId: t.projectId,
      })),
      publicHolidays: holidays.map((h) => ({
        id: h.id,
        name: h.name,
        date: h.date,
      })),
      leaves: leaves.map((l) => ({
        id: l.id,
        member: l.WorkspaceMember?.user?.surname || l.WorkspaceMember?.user?.name || "Member",
        type: l.type,
        startDate: l.startDate,
        endDate: l.endDate,
      })),
    };
  }

  /**
   * Schedule a new meeting and notify attendees via real-time Pusher and DB notifications.
   */
  static async createMeeting(workspaceId: string, organizerId: string, data: CreateMeetingInput) {
    const startTime = new Date(data.startTime);
    const endTime = new Date(data.endTime);

    // Normalize attendees: include organizer as accepted by default
    const rawAttendeeIds = Array.isArray(data.attendeeUserIds) ? data.attendeeUserIds : [];
    const attendeeUserIds = Array.from(new Set([organizerId, ...rawAttendeeIds]));

    const meeting = await prisma.meeting.create({
      data: {
        workspaceId,
        organizerId,
        title: data.title.trim(),
        description: data.description?.trim() || null,
        startTime,
        endTime,
        location: data.location?.trim() || null,
        meetingUrl: data.meetingUrl?.trim() || null,
        type: data.type || "INTERNAL",
        status: data.status || "SCHEDULED",
        color: data.color || "indigo",
        reminderMinutes: data.reminderMinutes ?? 15,
        isAllDay: data.isAllDay ?? false,
        projectId: data.projectId || null,
        attendees: {
          create: attendeeUserIds.map((uid) => ({
            userId: uid,
            status: uid === organizerId ? ("ACCEPTED" as AttendeeStatus) : ("INVITED" as AttendeeStatus),
          })),
        },
      },
      include: {
        organizer: {
          select: { id: true, name: true, surname: true, email: true, image: true },
        },
        project: {
          select: { id: true, name: true, slug: true, color: true },
        },
        attendees: {
          include: {
            user: {
              select: { id: true, name: true, surname: true, email: true, image: true },
            },
          },
        },
      },
    });

    // Notify other attendees
    await MeetingService.notifyInvitees(
      workspaceId,
      organizerId,
      meeting,
      attendeeUserIds.filter((id) => id !== organizerId)
    );

    // Broadcast workspace-wide meeting update for real-time UI sync
    await broadcastMeetingUpdate({
      workspaceId,
      type: "CREATE",
      meetingId: meeting.id,
      payload: meeting,
    });

    return meeting;
  }

  /**
   * Update meeting details or status.
   */
  static async updateMeeting(meetingId: string, workspaceId: string, userId: string, data: UpdateMeetingInput) {
    const existing = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: { attendees: true },
    });

    if (!existing || existing.workspaceId !== workspaceId) {
      throw new Error("Meeting not found in this workspace.");
    }

    const updateData: any = {};
    if (data.title !== undefined) updateData.title = data.title.trim();
    if (data.description !== undefined) updateData.description = data.description?.trim() || null;
    if (data.startTime !== undefined) updateData.startTime = new Date(data.startTime);
    if (data.endTime !== undefined) updateData.endTime = new Date(data.endTime);
    if (data.location !== undefined) updateData.location = data.location?.trim() || null;
    if (data.meetingUrl !== undefined) updateData.meetingUrl = data.meetingUrl?.trim() || null;
    if (data.type !== undefined) updateData.type = data.type;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.color !== undefined) updateData.color = data.color;
    if (data.reminderMinutes !== undefined) updateData.reminderMinutes = data.reminderMinutes;
    if (data.isAllDay !== undefined) updateData.isAllDay = data.isAllDay;
    if (data.projectId !== undefined) updateData.projectId = data.projectId;

    // Handle attendees reconciliation if provided
    if (Array.isArray(data.attendeeUserIds)) {
      const currentAttendeeUserIds = existing.attendees.map((a) => a.userId);
      const newAttendeeUserIds = Array.from(new Set([existing.organizerId, ...data.attendeeUserIds]));

      const toRemove = currentAttendeeUserIds.filter((id) => !newAttendeeUserIds.includes(id));
      const toAdd = newAttendeeUserIds.filter((id) => !currentAttendeeUserIds.includes(id));

      if (toRemove.length > 0) {
        await prisma.meetingAttendee.deleteMany({
          where: { meetingId, userId: { in: toRemove } },
        });
      }

      if (toAdd.length > 0) {
        await prisma.meetingAttendee.createMany({
          data: toAdd.map((uid) => ({
            meetingId,
            userId: uid,
            status: uid === existing.organizerId ? "ACCEPTED" : "INVITED",
          })),
        });

        await MeetingService.notifyInvitees(
          workspaceId,
          userId,
          { ...existing, startTime: updateData.startTime ?? existing.startTime, title: updateData.title ?? existing.title },
          toAdd.filter((id) => id !== userId)
        );
      }
    }

    const updated = await prisma.meeting.update({
      where: { id: meetingId },
      data: updateData,
      include: {
        organizer: {
          select: { id: true, name: true, surname: true, email: true, image: true },
        },
        project: {
          select: { id: true, name: true, slug: true, color: true },
        },
        attendees: {
          include: {
            user: {
              select: { id: true, name: true, surname: true, email: true, image: true },
            },
          },
        },
      },
    });

    await broadcastMeetingUpdate({
      workspaceId,
      type: "UPDATE",
      meetingId: updated.id,
      payload: updated,
    });

    return updated;
  }

  /**
   * Delete a meeting and broadcast deletion.
   */
  static async deleteMeeting(meetingId: string, workspaceId: string, userId: string) {
    const existing = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: { attendees: true },
    });

    if (!existing || existing.workspaceId !== workspaceId) {
      throw new Error("Meeting not found in this workspace.");
    }

    await prisma.meeting.delete({
      where: { id: meetingId },
    });

    await broadcastMeetingUpdate({
      workspaceId,
      type: "DELETE",
      meetingId,
      payload: { id: meetingId, title: existing.title },
    });

    return { success: true, id: meetingId };
  }

  /**
   * RSVP to a meeting invitation.
   */
  static async rsvpMeeting(meetingId: string, userId: string, status: AttendeeStatus) {
    const attendee = await prisma.meetingAttendee.upsert({
      where: {
        meetingId_userId: { meetingId, userId },
      },
      update: { status },
      create: {
        meetingId,
        userId,
        status,
      },
      include: {
        meeting: {
          select: { workspaceId: true },
        },
      },
    });

    await broadcastMeetingUpdate({
      workspaceId: attendee.meeting.workspaceId,
      type: "RSVP_UPDATE",
      meetingId,
      payload: { meetingId, userId, status },
    });

    return attendee;
  }
}
