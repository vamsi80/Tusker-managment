import { apiFetch } from "./fetch-wrapper";
import { type ApiResponse } from "./types";

export interface MeetingAttendeeUI {
  id: string;
  userId: string;
  status: "INVITED" | "ACCEPTED" | "DECLINED" | "TENTATIVE";
  user?: {
    id: string;
    name: string;
    surname?: string | null;
    email: string;
    image?: string | null;
  };
}

export interface MeetingUI {
  id: string;
  workspaceId: string;
  title: string;
  description?: string | null;
  startTime: string;
  endTime: string;
  location?: string | null;
  meetingUrl?: string | null;
  type: "INTERNAL" | "CLIENT" | "PROJECT_REVIEW" | "ONE_ON_ONE" | "GENERAL";
  status: "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  color?: string | null;
  reminderMinutes: number;
  isAllDay: boolean;
  organizerId: string;
  projectId?: string | null;
  createdAt: string;
  updatedAt: string;
  organizer?: {
    id: string;
    name: string;
    surname?: string | null;
    email: string;
    image?: string | null;
  };
  project?: {
    id: string;
    name: string;
    slug: string;
    color: string;
  } | null;
  attendees: MeetingAttendeeUI[];
}

export interface CalendarLayerData {
  meetings: MeetingUI[];
  taskDeadlines: Array<{
    id: string;
    title: string;
    date: string;
    status: string;
    taskSlug: string;
    projectId: string;
  }>;
  publicHolidays: Array<{
    id: string;
    name: string;
    date: string;
  }>;
  leaves: Array<{
    id: string;
    member: string;
    type: string;
    startDate: string;
    endDate: string;
  }>;
}

export interface CreateMeetingPayload {
  workspaceId: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  location?: string;
  meetingUrl?: string;
  type?: "INTERNAL" | "CLIENT" | "PROJECT_REVIEW" | "ONE_ON_ONE" | "GENERAL";
  status?: "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  color?: string;
  reminderMinutes?: number;
  isAllDay?: boolean;
  projectId?: string;
  attendeeUserIds?: string[];
}

export const meetingsClient = {
  getMeetings: async (params: {
    workspaceId: string;
    startDate?: string;
    endDate?: string;
    projectId?: string;
    type?: string;
    includeLayers?: boolean;
  }): Promise<CalendarLayerData> => {
    const search = new URLSearchParams();
    search.set("workspaceId", params.workspaceId);
    if (params.startDate) search.set("startDate", params.startDate);
    if (params.endDate) search.set("endDate", params.endDate);
    if (params.projectId) search.set("projectId", params.projectId);
    if (params.type) search.set("type", params.type);
    if (params.includeLayers) search.set("includeLayers", "true");

    const res = await apiFetch<ApiResponse<CalendarLayerData>>(`/meetings?${search.toString()}`);
    return res.data || { meetings: [], taskDeadlines: [], publicHolidays: [], leaves: [] };
  },

  createMeeting: async (data: CreateMeetingPayload): Promise<MeetingUI> => {
    const res = await apiFetch<ApiResponse<MeetingUI>>("/meetings", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return res.data!;
  },

  updateMeeting: async (id: string, workspaceId: string, data: Partial<CreateMeetingPayload>): Promise<MeetingUI> => {
    const res = await apiFetch<ApiResponse<MeetingUI>>(`/meetings/${id}?workspaceId=${workspaceId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    return res.data!;
  },

  deleteMeeting: async (id: string, workspaceId: string): Promise<{ success: boolean; id: string }> => {
    const res = await apiFetch<ApiResponse<{ success: boolean; id: string }>>(`/meetings/${id}?workspaceId=${workspaceId}`, {
      method: "DELETE",
    });
    return res.data!;
  },

  rsvpMeeting: async (id: string, status: "INVITED" | "ACCEPTED" | "DECLINED" | "TENTATIVE"): Promise<any> => {
    const res = await apiFetch<ApiResponse<any>>(`/meetings/${id}/rsvp`, {
      method: "POST",
      body: JSON.stringify({ status }),
    });
    return res.data;
  },
};
