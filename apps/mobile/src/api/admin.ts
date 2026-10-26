import { api } from "./client";

/** apps/api/src/hono/routes/workspace-admin.ts — the web's Server Action features. */
export const adminApi = {
    departments: (workspaceId: string) => api.get<any[]>(`/workspace-admin/${workspaceId}/departments`),
    shiftSchedules: (workspaceId: string) => api.get<any[]>(`/workspace-admin/${workspaceId}/shift-schedules`),
    createDepartment: (workspaceId: string, input: { name: string; shiftScheduleId?: string | null }) =>
        api.post(`/workspace-admin/${workspaceId}/departments`, input),
    updateDepartment: (workspaceId: string, id: string, input: { name: string; shiftScheduleId?: string | null }) =>
        api.patch(`/workspace-admin/${workspaceId}/departments/${id}`, input),
    deleteDepartment: (workspaceId: string, id: string) => api.del(`/workspace-admin/${workspaceId}/departments/${id}`),
    updateShiftSchedule: (workspaceId: string, id: string, input: Record<string, string>) =>
        api.patch(`/workspace-admin/${workspaceId}/shift-schedules/${id}`, input),

    permissions: (workspaceId: string) => api.get<any>(`/workspace-admin/${workspaceId}/permissions`),
    setRolePermission: (workspaceId: string, input: { role: string; capability: string; value: boolean | null }) =>
        api.patch(`/workspace-admin/${workspaceId}/permissions/role`, input),
    setMemberPermission: (workspaceId: string, input: { workspaceMemberId: string; capability: string; value: boolean | null }) =>
        api.patch(`/workspace-admin/${workspaceId}/permissions/member`, input),

    activity: (workspaceId: string) => api.get<any[]>(`/workspace-admin/${workspaceId}/activity`),
    attendanceSettings: (workspaceId: string) => api.get<any>(`/workspace-admin/${workspaceId}/attendance-settings`),
};
