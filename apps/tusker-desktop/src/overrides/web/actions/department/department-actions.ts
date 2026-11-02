/**
 * Desktop stand-in for apps/web/src/actions/department/department-actions.ts
 * (server actions). Same exports and result shapes, backed by the API routes
 * that serve these features to the mobile app (apps/api .../workspace-admin.ts).
 */
import { action, api } from "../../lib/desktop-api";

type Department = { id: string; name: string };

export async function listDepartments(workspaceId: string) {
    const result = await action(() => api<Department[]>(`/workspaces/${workspaceId}/departments`), "Failed to load departments");
    return result.success ? result : { ...result, data: [] as Department[] };
}

export async function createDepartment(data: { workspaceId: string; name: string; shiftScheduleId?: string | null }) {
    return action(
        () => api<Department>(`/workspace-admin/${data.workspaceId}/departments`, { body: { name: data.name, shiftScheduleId: data.shiftScheduleId ?? null } }),
        "Failed to create department",
    );
}

export async function updateDepartment(data: { id?: string; workspaceId: string; name: string; shiftScheduleId?: string | null }) {
    if (!data.id) return { success: false as const, error: "Department ID is required" };
    return action(
        () =>
            api<Department>(`/workspace-admin/${data.workspaceId}/departments/${data.id}`, {
                method: "PATCH",
                body: { name: data.name, shiftScheduleId: data.shiftScheduleId ?? null },
            }),
        "Failed to update department",
    );
}

export async function deleteDepartment(data: { id: string; workspaceId: string }) {
    return action(() => api(`/workspace-admin/${data.workspaceId}/departments/${data.id}`, { method: "DELETE" }), "Failed to delete department");
}

export async function updateShiftSchedule(data: { id: string; workspaceId: string; [field: string]: unknown }) {
    const { id, workspaceId, ...fields } = data;
    return action(
        () => api(`/workspace-admin/${workspaceId}/shift-schedules/${id}`, { method: "PATCH", body: fields }),
        "Failed to update shift schedule",
    );
}
