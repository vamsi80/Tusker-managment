/**
 * Desktop stand-in for apps/web/src/data/department/get-departments.ts. The
 * workspace-admin routes run the same queries (same selects) on the API.
 */
import { api } from "../../lib/desktop-api";

export type { DepartmentMember, DepartmentWithSchedule, ShiftScheduleData } from "../../../../../../web/src/data/department/get-departments";

export const getWorkspaceDepartments = (workspaceId: string) => api<any[]>(`/workspace-admin/${workspaceId}/departments`);

export const getWorkspaceShiftSchedules = (workspaceId: string) => api<any[]>(`/workspace-admin/${workspaceId}/shift-schedules`);
