import { api, request } from "./client";

/** Attendance, leave, daily reports, meetings, points — the "Team" side of the web. */

export const attendanceApi = {
    /** Paginated workspace log; multi-value filters are JSON-encoded (parseMultiQuery). */
    list: async (
        workspaceId: string,
        f: { startDate?: string; endDate?: string; memberId?: string[]; status?: string[]; search?: string; page?: number; pageSize?: number } = {},
    ) => {
        const body = await request<any>("/attendance", {
            headers: { "x-workspace-id": workspaceId },
            query: {
                startDate: f.startDate,
                endDate: f.endDate,
                memberId: f.memberId?.length ? JSON.stringify(f.memberId) : undefined,
                status: f.status?.length ? JSON.stringify(f.status) : undefined,
                search: f.search,
                page: f.page ?? 1,
                pageSize: f.pageSize ?? 30,
            },
        });
        return { records: (body.data ?? []) as any[], totalCount: (body.totalCount ?? 0) as number };
    },
    today: (workspaceId: string, clientDateString?: string) =>
        api.get<any>("/attendance/today", { workspaceId, clientDateString }, { "x-workspace-id": workspaceId }),
    register: async (workspaceId: string, clientDateString?: string) => {
        const body = await request<any>("/attendance/register", { query: { workspaceId, clientDateString } });
        return (body.register ?? body.data ?? []) as { member: any; attendance: any }[];
    },
    stats: (workspaceId: string, memberId: string) => api.get<any>("/attendance/stats", { workspaceId, memberId }),
    checkIn: (workspaceId: string, body: { latitude: number; longitude: number; accuracy?: number; address?: string; notes?: string }) =>
        request<any>("/attendance/check-in", { method: "POST", body: { workspaceId, ...body }, headers: { "x-workspace-id": workspaceId } }),
    checkOut: (workspaceId: string, body: { latitude: number; longitude: number; accuracy?: number; address?: string; notes?: string }) =>
        request<any>("/attendance/check-out", { method: "POST", body: { workspaceId, ...body }, headers: { "x-workspace-id": workspaceId } }),
    update: (workspaceId: string, id: string, body: Record<string, any>) =>
        request(`/attendance/${id}`, { method: "PATCH", body, headers: { "x-workspace-id": workspaceId } }),
    reconcile: (workspaceId: string, date?: string) =>
        request("/attendance/reconcile", { method: "POST", body: { date }, headers: { "x-workspace-id": workspaceId } }),
    updateSettings: (workspaceId: string, body: Record<string, any>) =>
        request("/attendance/settings", { method: "PATCH", body, headers: { "x-workspace-id": workspaceId } }),
    /** Monthly Excel export (admins). Returns the raw Response for saving. */
    exportMonth: (workspaceId: string, year: number, month: number) =>
        request<Response>("/attendance/export", { raw: true, query: { year, month }, headers: { "x-workspace-id": workspaceId } }),
};

/** The web's leaves table uses /attendance/leave-request (workspace from the x-workspace-id header). */
export const leavesApi = {
    list: async (workspaceId: string, p: { page?: number; pageSize?: number; search?: string } = {}) => {
        const body = await request<any>("/attendance/leave-request", {
            headers: { "x-workspace-id": workspaceId },
            query: { page: p.page ?? 1, pageSize: p.pageSize ?? 20, search: p.search },
        });
        return { leaves: (body.data ?? []) as any[], totalCount: (body.totalCount ?? 0) as number };
    },
    balance: (workspaceId: string) => api.get<any>("/attendance/leave-balance", undefined, { "x-workspace-id": workspaceId }),
    create: (workspaceId: string, body: { startDate: string; endDate: string; reason: string; type: string }) =>
        request("/attendance/leave-request", { method: "POST", body, headers: { "x-workspace-id": workspaceId } }),
    update: (workspaceId: string, id: string, body: { startDate: string; endDate: string; reason: string; type: string }) =>
        request(`/attendance/leave-request/${id}`, { method: "PUT", body, headers: { "x-workspace-id": workspaceId } }),
    setStatus: (workspaceId: string, id: string, status: "APPROVED" | "REJECTED" | "PENDING") =>
        request(`/attendance/leave-request/${id}`, { method: "PATCH", body: { status }, headers: { "x-workspace-id": workspaceId } }),
    remove: (workspaceId: string, id: string) =>
        request(`/attendance/leave-request/${id}`, { method: "DELETE", headers: { "x-workspace-id": workspaceId } }),
};

export const reportsApi = {
    list: (workspaceId: string, p: { date?: string; userId?: string[]; skip?: number; take?: number } = {}) =>
        api.get<any[]>(`/reports/${workspaceId}`, {
            date: p.date,
            userId: p.userId?.length ? JSON.stringify(p.userId) : undefined,
            skip: p.skip ?? 0,
            take: p.take ?? 30,
        }),
    entries: (workspaceId: string, reportId: string) => api.get<any[]>(`/reports/${workspaceId}/entries/${reportId}`),
    status: (workspaceId: string) => api.get<{ status: string }>(`/reports/${workspaceId}/status`),
    formData: (workspaceId: string) => api.get<{ report: any; suggestedTasks: any[] }>(`/reports/${workspaceId}/form-data`),
    submit: (workspaceId: string, body: { date?: string; entries: { taskId?: string | null; description: string }[] }) =>
        api.post(`/reports/${workspaceId}`, { workspaceId, ...body }),
};

export type MeetingInput = {
    workspaceId: string;
    title: string;
    description?: string | null;
    startTime: string;
    endTime: string;
    location?: string | null;
    meetingUrl?: string | null;
    type?: string;
    status?: string;
    color?: string;
    reminderMinutes?: number;
    isAllDay?: boolean;
    projectId?: string | null;
    attendeeUserIds?: string[];
};

export const meetingsApi = {
    /** Meetings plus the task-deadline / holiday / leave layers for the calendar. */
    calendar: (workspaceId: string, p: { startDate?: string; endDate?: string; projectId?: string; type?: string } = {}) =>
        api.get<{ meetings: any[]; taskDeadlines: any[]; publicHolidays: any[]; leaves: any[] }>("/meetings", {
            workspaceId,
            includeLayers: "true",
            ...p,
        }),
    create: (input: MeetingInput) => api.post("/meetings", input),
    conflicts: (input: { workspaceId: string; startTime: string; endTime: string; location?: string | null; attendeeUserIds?: string[]; excludeMeetingId?: string }) =>
        api.post<any[]>("/meetings/conflicts", input),
    update: (id: string, workspaceId: string, input: Partial<MeetingInput>) => api.patch(`/meetings/${id}`, input, { workspaceId }),
    remove: (id: string, workspaceId: string) => api.del(`/meetings/${id}`, undefined, { workspaceId }),
    rsvp: (id: string, status: "ACCEPTED" | "DECLINED" | "TENTATIVE") => api.post(`/meetings/${id}/rsvp`, { status }),
};

export const pointsApi = {
    summary: (workspaceId: string) => api.get<any>(`/points/${workspaceId}/summary`),
    entries: (workspaceId: string, p: { memberId?: string; cursor?: string; limit?: number } = {}) =>
        api.get<any>(`/points/${workspaceId}/entries`, p),
    award: (workspaceId: string, body: { memberId: string; points: number; reason: string }) => api.post(`/points/${workspaceId}/awards`, body),
};
